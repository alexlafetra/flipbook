import { useState , useEffect , useRef} from 'react'
import './main.css';
import JSZip from 'jszip'
import { Sprite , PixelFrame } from './Sprite';
import { ColorPicker, hexToRGBA, rgbaToHex } from './components/ColorPicker';
import { TabTitle } from './components/TabTitle';
import { SelectionBox } from './SelectionBox';
import { canvasesToGif, gifToSprite } from './gifs';
import { DropZone } from './components/DropZone';
import { Setting } from './components/SettingsButton';
import { CanvasToBMP } from './CanvasToBMP';
// helpful chatGPT react tip:
/*
Important rule:

🟥 DO NOT mutate the structure of sprites, frames[], or spritesheet objects in-place.

🟩 DO mutate the PixelFrame.data buffer in-place.
*/
//Basically, you're only using react rerenders to redraw
//the UI. NOT the pixel data, which you redraw manually!

function App() {
  const [settings,setSettings] = useState({
    overlayGhosting: true,
    overlayGrid: true,
    frameSpeed : 600,//speed in ms
    currentTool: 'pixel',
    tooltip:null,
    currentColor:1,//1 for white, 0 for black
    canvasScale:12,
    playing:false,
    lineStarted:false,
    moveStarted:false,
    overwriteWithBackground:false,
    parseFilesToSpritesByName:false,
    useAlphaAsBackground:false,
    resizeCanvasToImage:true,
    maxCanvasDimension:200,
    palletteOpen:false,
    settingsBoxOpen:true,
    renderByteArray:true,
    foregroundColor:'#ffffffff',
    backgroundColor:'#000000ff',
    overlayColor:'#4b4b4bff',
    bytePackingFormat:'vertical'
  })
  const settingsRef = useRef(settings);
  const backupSettingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const zip = useRef(new JSZip());
  const startClickCoords = useRef({x:0,y:0});
  const pixelSaveState = useRef(undefined);
  const mainCanvasRef = useRef(null);
  //use this to clear the playNextFrame() timeout
  const timeoutIDRef = useRef(null);

  const [currentMouseCoords,setCurrentMouseCoords] = useState(null);
  const currentMouseCoordsRef = useRef(currentMouseCoords);
  useEffect(() => {
    currentMouseCoordsRef.current = currentMouseCoords;
  }, [currentMouseCoords]);


  const undoBuffer = useRef([]);
  const redoBuffer = useRef([]);

  function pushUndoState(){
    //if the buffer gets long enough, start removing early entries
    if(undoBuffer.current.length > 200){
      undoBuffer.current.shift();
    }
    undoBuffer.current.push({
      spritesJSON:JSON.stringify(spritesRef.current),
      currentSprite:currentSpriteRef.current
    });
    //adding to the undo buffer resets the redo buffer
    redoBuffer.current = [];
  }

  function restoreState(state){
    const restoredSprites = JSON.parse(state.spritesJSON);
    //rebuild sprites object from json
    const hydrated = restoredSprites.map(raw => {
      const restoredSprite = Sprite();
      restoredSprite.width = raw.width;
      restoredSprite.height = raw.height;
      restoredSprite.fileName = raw.fileName;
      restoredSprite.currentFrame = raw.currentFrame;
      restoredSprite.frames = raw.frames.map(frame => {
        const newFrame = PixelFrame(frame.width,frame.height,frame.data);
        return newFrame;
      });
      return restoredSprite;
    }) 
    setSprites([...hydrated]);
    setCurrentSprite(state.currentSprite);
  }

  function undo(){
    if(undoBuffer.current.length === 0)
      return;
    const previousState = undoBuffer.current.pop();
    redoBuffer.current.push({
      spritesJSON:JSON.stringify(spritesRef.current),
      currentSprite:currentSpriteRef.current
    });
    restoreState(previousState);
  }

  function redo(){
    if(redoBuffer.current.length === 0)
      return;
    const nextState = redoBuffer.current.pop();
    undoBuffer.current.push({
      spritesJSON:JSON.stringify(spritesRef.current),
      currentSprite:currentSpriteRef.current
    });
    restoreState(nextState);
  }

  const [selectionBox,setSelectionBox] = useState(SelectionBox());
  const selectionBoxRef = useRef(selectionBox);
  const selectedArea = useRef(null);
  const copyBuffer = useRef(null);

  useEffect(() => {
    selectionBoxRef.current = selectionBox;
  },[selectionBox]);

  const selectionBoxStyle = {
    border:'1px dashed red',
    width:selectionBox.getWidth()*settings.canvasScale,
    height:selectionBox.getHeight()*settings.canvasScale,
    backgroundColor:'#ff00004c',
    position:'absolute',
    marginLeft:(selectionBox.getOffsetLeft()*settings.canvasScale-1)+'px',
    marginTop:(selectionBox.getOffsetTop()*settings.canvasScale-1)+'px'
  };

  //update the highlight on the divs whenever the mouse coords are updated
  useEffect(()=>{
    const divs = document.getElementsByClassName("grid_div");
    for(let div of divs){
      div.style.backgroundColor = 'transparent';
    }
    if(currentMouseCoords === null)
      return;
    const sprite = spritesRef.current[currentSpriteRef.current];
    const index = currentMouseCoords.y * sprite.width + currentMouseCoords.x;
    const targetDiv = document.getElementById("grid_div_"+index);
    if(targetDiv)
      targetDiv.style.backgroundColor = '#04ff008f';
  },[currentMouseCoords]);

  const [sprites,setSprites] = useState([Sprite()]);
  const spritesRef = useRef(sprites);
  useEffect(() => {
    spritesRef.current = sprites;
  },[sprites]);

  const [currentSprite,setCurrentSprite] = useState(0);
  const currentSpriteRef = useRef(currentSprite);
  useEffect(() => {
    currentSpriteRef.current = currentSprite;
  },[currentSprite]);

  const [userInputDimensions,setUserInputDimensions] = useState({
    width:sprites[currentSprite].width,
    height:sprites[currentSprite].height
  });
  const userInputDimensionsRef = useRef(userInputDimensions);
  useEffect(() => {
    userInputDimensionsRef.current = userInputDimensions;
  },[userInputDimensions]);

  useEffect(() => {
    renderCurrentFrameToMainCanvas();
  },[sprites,currentSprite,settings,currentMouseCoords]);


  useEffect(() => {
    //add keyboard input event listener
    window.addEventListener("keydown",handleKeyDown);
    window.addEventListener("keyup",handleKeyUp);
  },[]);

  function getClickCoords(e){
    const sprite = spritesRef.current[currentSpriteRef.current];
    const dims = e.target.getBoundingClientRect();
    let clickCoords;
    if(e.type === 'touchmove'){
      clickCoords = {
        x:e.touches[0].clientX - dims.left,
        y:e.touches[0].clientY - dims.top
      };
    }
    else{
      clickCoords = {
        x:e.clientX - dims.left,
        y:e.clientY - dims.top
      };
    }
    //px per char
    const pixelDims = {
      width : dims.width / sprite.width,
      height : dims.height / sprite.height,
    };
    return {x: Math.trunc(clickCoords.x/pixelDims.width),x_rounded:Math.round(clickCoords.x/pixelDims.width),y:Math.trunc(clickCoords.y/pixelDims.height),y_rounded:Math.round(clickCoords.y/pixelDims.height)};
  }

  function handleMouseUp(e){
    const coords = getClickCoords(e);
    switch(settingsRef.current.currentTool){
      case 'line':
        setSettings({
          ...settingsRef.current,
          lineStarted : false
        });
        break;
      case 'move':
        setSettings({
          ...settingsRef.current,
          moveStarted : false
        });
        break;
      case 'select':
        if(selectionBoxRef.current.hasStarted){
          //if an area with a dimension less than 1 was selected, cancel the box
          if(Math.abs(coords.x_rounded - selectionBoxRef.current.start.x) < 1 || Math.abs(coords.y_rounded - selectionBoxRef.current.start.y) < 1){
            setSelectionBox(prev => {
              return{
                ...prev,
                active:false,
                hasStarted:false,
              }
            });
          }
          else{
            setSelectionBox(prev => {
              return{
                ...prev,
                active:true,
                hasStarted:false,
                end:{x:coords.x_rounded,y:coords.y_rounded}
              }
            });
          }
        }
        break;
      
    }
  }
  function handleMouseDown(e){
    const coords = getClickCoords(e);
    startClickCoords.current = coords;
    const sprite = spritesRef.current[currentSpriteRef.current];
    switch(settingsRef.current.currentTool){
      case 'pixel':
        pushUndoState();
        const newFrames = sprite.frames;
        newFrames[sprite.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
        setSprites(prev => (
          [...prev]
        ));
        break;
      case 'fill':{
        pushUndoState();
        const newFrames = sprite.frames;
        newFrames[sprite.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
        setSprites(prev => (
          [...prev]
        ));
        }
        break;
      case 'line':
        //if you haven't started drawing a line yet
        if(!settingsRef.current.lineStarted){
          pushUndoState();
          startClickCoords.current = coords;
          //make a backup of the line
          pixelSaveState.current = PixelFrame(sprite.width,sprite.height,sprite.frames[sprite.currentFrame].data);
          sprite.frames[sprite.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
          setSettings({
            ...settingsRef.current,
            lineStarted : true
          });
        }
      case 'move':
        if(!settingsRef.current.moveStarted){
          pushUndoState();
          //store the selected area
          if(selectionBoxRef.current.active){
            selectedArea.current = PixelFrame(selectionBoxRef.current.getWidth(),selectionBoxRef.current.getHeight(),0);
            pixelSaveState.current = PixelFrame(sprite.width,sprite.height,sprite.frames[sprite.currentFrame].data);
            const bounds = {
              start: {x:Math.min(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.min(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)},
              end: {x:Math.max(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.max(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)}
            };
            //copy area into pixel array
            for(let x = 0; x<selectionBoxRef.current.getWidth(); x++){
              for(let y = 0; y<selectionBoxRef.current.getHeight(); y++){
                selectedArea.current.setPixel(x,y,sprites[currentSprite].frames[sprites[currentSprite].currentFrame].getPixel(x+bounds.start.x,y+bounds.start.y));
                //clear out pixels from canvas backup
                pixelSaveState.current.setPixel(x+bounds.start.x,y+bounds.start.y,0);
              }
            }
            //make a backup of the whole canvas
          }
          setSettings({
            ...settingsRef.current,
            moveStarted : true
          });
        }
        break;
      case 'select':
        setSelectionBox(prev => {
          return{
            ...prev,
            active:false,
            hasStarted:true,
            start:{x:coords.x_rounded,y:coords.y_rounded},
            end:{x:coords.x_rounded,y:coords.y_rounded}
          }
        })
        break;
    }
  }
  function handleMouseLeave(e){
    setCurrentMouseCoords(null);
    setSettings({...settingsRef.current,tooltip:null});
  }
  function handleMouseMove(e){
    const coords = getClickCoords(e);
    setCurrentMouseCoords(coords);
    //detect if the mouse button is held down (necessary for dragging)
    if(e.buttons || (e.type === 'touchmove') ){
      if(e.type === 'touchmove' && e.touches.length > 1){
        return;
      }
      const sprite = spritesRef.current[currentSpriteRef.current];
      switch(settingsRef.current.currentTool){
        case 'pixel':
          sprite.frames[sprite.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
          setSprites(prev => (
            [...prev]
          ));
          break;
        case 'line':
          //if you've already started a line, draw it
          if(settingsRef.current.lineStarted){
            sprite.frames[sprite.currentFrame] = PixelFrame(pixelSaveState.current.width,pixelSaveState.current.height,pixelSaveState.current.data);
            sprite.frames[sprite.currentFrame].drawLine(startClickCoords.current.x,startClickCoords.current.y,coords.x,coords.y,settingsRef.current.currentColor);
            setSprites(prev => (
              [...prev]
            ));
          }
          //if you haven't, start one rn
          else{
            startClickCoords.current = coords;
            //make a backup of the line
            pixelSaveState.current = PixelFrame(sprite.width,sprite.height,sprite.frames[sprite.currentFrame].data);
            setSettings({
              ...settingsRef.current,
              lineStarted : true
            });
          }
          break;
        case 'fill':{
            sprite.frames[sprite.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
            setSprites(prev => (
              [...prev]
            ));
          }
          break;
        case 'move':
          if(settingsRef.current.moveStarted){
            const movement = {
              x: coords.x - startClickCoords.current.x,
              y: coords.y - startClickCoords.current.y
            };
            if(movement.x || movement.y){
              startClickCoords.current = coords;
              shiftPixels(movement);
            }
          }
          break;
        case 'select':
          if(selectionBox.hasStarted){
            setSelectionBox(prev => {
              return{
                ...prev,
                active:false,
                hasStarted:true,
                end:{x:coords.x_rounded,y:coords.y_rounded}
              }
            })
          }
          break;
      }
    }
    else{
      setSettings({
        ...settingsRef.current,
        lineStarted : false
      });
    }
  }
  function cut(){
    copy(true);
  }
  function copy(cut){
    if(!selectionBoxRef.current.active)
      return;
    if(cut)
      pushUndoState();
    copyBuffer.current = PixelFrame(selectionBoxRef.current.getWidth(),selectionBoxRef.current.getHeight(),0);
    const bounds = {
      start: {x:Math.min(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.min(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)},
      end: {x:Math.max(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.max(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)}
    };
    const sprite = spritesRef.current[currentSpriteRef.current];
    //copy area into pixel array
    for(let x = 0; x<copyBuffer.current.width; x++){
      for(let y = 0; y<copyBuffer.current.height; y++){
        copyBuffer.current.setPixel(x,y,sprite.frames[sprite.currentFrame].getPixel(x+bounds.start.x,y+bounds.start.y));
        //clear out pixels, if you're cutting
        if(cut)
          sprite.frames[sprite.currentFrame].setPixel(x+bounds.start.x,y+bounds.start.y,0);
      }
    }
    if(cut)
      setSprites(prev => (
        [...prev]
      ));
  }
  function paste(){
    if(!currentMouseCoordsRef.current || !copyBuffer.current)
      return;
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    const origin = currentMouseCoordsRef.current;
    for(let x = 0; x<copyBuffer.current.width; x++){
      for(let y = 0; y<copyBuffer.current.height; y++){
        sprite.frames[sprite.currentFrame].setPixel(x+origin.x,y+origin.y,copyBuffer.current.getPixel(x,y));
      }
    }
    setSprites(prev => (
      [...prev]
    ));
  }

  function shiftPixels(heading){
    const sprite = spritesRef.current[currentSpriteRef.current];

    //if a selection box is active, use it to translate pixels
    if(selectionBoxRef.current.active && selectedArea.current){
      sprite.frames[sprite.currentFrame] = PixelFrame(pixelSaveState.current.width,pixelSaveState.current.height,pixelSaveState.current.data);
      
      const bounds = {
        start: {x:Math.min(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.min(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)},
        end: {x:Math.max(selectionBoxRef.current.start.x,selectionBoxRef.current.end.x),y:Math.max(selectionBoxRef.current.start.y,selectionBoxRef.current.end.y)}
      };
      //put selected area back in, offset a bit
      for(let x = 0;x<selectedArea.current.width;x++){
        for(let y = 0;y<selectedArea.current.height;y++){
          //check to see if background should overwrite foreground
          if((!settingsRef.current.overwriteWithBackground && (selectedArea.current.getPixel(x,y) === 1)) || settingsRef.current.overwriteWithBackground)
            sprite.frames[sprite.currentFrame].setPixel(x+heading.x+bounds.start.x,y+heading.y+bounds.start.y,selectedArea.current.getPixel(x,y));
        }
      }
      setSelectionBox(prev => {
        return{
          ...prev,
          start:{x:bounds.start.x+heading.x,y:bounds.start.y+heading.y},
          end:{x:bounds.end.x+heading.x,y:bounds.end.y+heading.y}
        }
      });
    }
    else{
      const newFrame = PixelFrame(sprite.width, sprite.height, 0);
      
      //copy over data, but shifted
      for(let x = 0; x<sprite.frames[sprite.currentFrame].width; x++){
        for(let y = 0; y<sprite.frames[sprite.currentFrame].height; y++){
          newFrame.setPixel(x+heading.x,y+heading.y,sprite.frames[sprite.currentFrame].getPixel(x,y));
        }
      }
      sprite.frames[sprite.currentFrame] = newFrame;
    }
    setSprites(prev => (
      [...prev]
    ));
  }

  function renderCurrentFrameToMainCanvas(){
    const canvas = mainCanvasRef.current;
    if(!canvas)
      return;

    const sprite = spritesRef.current[currentSpriteRef.current];

    //figure out the last frame, to draw ghosting
    let previousFrame = undefined;
    if(sprite.currentFrame > 0)
      previousFrame = sprite.currentFrame - 1;
    else if(sprite.frames.length > 1)
      previousFrame = sprite.frames.length-1;

    //set canvas dims (these aren't the visual size of the canvas)
    canvas.width = sprite.width;
    canvas.height = sprite.height;

    //get drawing context
    const context = canvas.getContext("2d");
    //draw over each pixel
    for(let x = 0; x<sprite.width; x++){
      for(let y = 0; y<sprite.height; y++){

        // if(currentMouseCoordsRef.current != null && currentMouseCoordsRef.current.x == x && currentMouseCoordsRef.current.y == y)
        //   context.fillStyle = '#008b00ff';
        //if there's a pixel there, draw foreground color
        if(sprite.frames[sprite.currentFrame].getPixel(x,y)){
          context.fillStyle = settingsRef.current.foregroundColor;
        }
        else{
          //if there's a no pixel, but one on a previous frame, ghost it
          if(previousFrame !== undefined  && settingsRef.current.overlayGhosting && sprite.frames[previousFrame].getPixel(x,y)){
            context.fillStyle = blendColor(settingsRef.current.foregroundColor,settingsRef.current.backgroundColor);
          }
          else{
            context.fillStyle = settingsRef.current.backgroundColor;
          }
        }
        context.fillRect(x,y,1,1);
      }
    }
  }

  function blendColor(c1,c2){
    let newBytes = '#';
    for(let byte = 0; byte<3; byte++){
      const b1 = c1.substring(byte+1,byte+3);
      const b2 = c2.substring(byte+1,byte+3);
      newBytes += (Math.round((parseInt(b1,16)+parseInt(b2,16))/2)).toString(16).padStart(2,'0');
    }
    return newBytes;
  }

  function renderFrame(context,sprite,frame,offset){
    if(!offset)
      offset = {x:0,y:0};
    //draw over each pixel
    for(let x = 0; x<sprite.width; x++){
      for(let y = 0; y<sprite.height; y++){
        context.fillStyle = sprite.frames[frame].getPixel(x,y)?settingsRef.current.foregroundColor:settingsRef.current.backgroundColor;
        context.fillRect(x+offset.x,y+offset.y,1,1);
      }
    }
  }

  function playNextFrame(){
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.nextFrame();
    setSprites(prev => (
      [...prev]
    ));
    timeoutIDRef.current = window.setTimeout(playNextFrame,settingsRef.current.frameSpeed);
  }

  function clearFrame(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame] = PixelFrame(sprite.width, sprite.height, 0);
    setSprites(prev => (
      [...prev]
    ));
  }

  function invertFrame(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame].invert();
    setSprites(prev => (
      [...prev]
    ));
  }
  function mirrorHorizontally(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame].mirror('horizontal');
    setSprites(prev => (
      [...prev]
    ));
  }
  function mirrorVertically(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame].mirror('vertical');
    setSprites(prev => (
      [...prev]
    ));
  }

  function addNewFrame(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames = [...sprite.frames,PixelFrame(sprite.width, sprite.height, 0)];
    sprite.currentFrame = sprite.frames.length-1;
    //trigger rerender to remake previews
    setSprites(prev => (
      [...prev]
    ));
  }

  function duplicateFrame(frame){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    const newFrame = PixelFrame(sprite.width, sprite.height, 0);
    
    //copy over all the data (can't copy object ref)
    for(let i = 0; i<newFrame.data.length; i++){
      newFrame.data[i] = sprite.frames[frame].data[i];
    }
    const newFrames = [...sprite.frames];
    newFrames.splice(frame,0,newFrame);
    sprite.currentFrame = frame+1;
    sprite.frames = newFrames;
    //trigger rerender to recreate previews
    setSprites(prev => (
      [...prev]
    ));
  }

  function deleteFrame(frameIndex){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    //if no frame was specified, delete the currently viewed frame
    if(frameIndex === undefined)
      frameIndex = sprite.currentFrame;
    if(sprite.frames.length>1){
      const newFrames = sprite.frames.toSpliced(frameIndex,1);
      sprite.frames = newFrames;
      sprite.currentFrame = Math.min(sprite.currentFrame,sprite.frames.length-1);
      //trigger rerender to recreate previews
      setSprites(prev => (
        [...prev]
      ));
    }
  }

  function reverseFrames(){
    pushUndoState();
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames.reverse();
    setSprites(prev => (
      [...prev]
    ));
  }

  function handleKeyDown(e){
    if((e.target === document.body)){
      const sprite = spritesRef.current[currentSpriteRef.current];
      switch(e.key){
        case 'X':
        case 'x':
          if(e.metaKey || e.ctrlKey){
            cut();
          }
          break;
        case 'C':
        case 'c':
          if(e.metaKey || e.ctrlKey){
            copy();
          }
          break;
        case 'Z':
        case 'z':
          if(e.metaKey || e.ctrlKey){
            if(e.shiftKey){
              redo();
            }
            else{
              undo();
            }
          }
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          const newVal = parseInt(e.key)-1;
          if(newVal<sprite.frames.length){
            sprite.currentFrame = newVal;
            setSprites(prev => (
              [...prev]
            ));
          }
          break;
        case '+':
        case '=':
          addNewFrame();
          break;
        case '-':
          deleteFrame();
          break;
        case 'p':
        case 'P':
          setSettings({...settingsRef.current,currentTool:'pixel'});
          break;
        case 's':
        case 'S':
          setSettings({...settingsRef.current,currentTool:'select'});
          break;
        case 'l':
        case 'L':
          setSettings({...settingsRef.current,currentTool:'line'});
          break;
        case 'f':
        case 'F':
          setSettings({...settingsRef.current,currentTool:'fill'});
          break;
        case 'v':
        case 'V':
          if(e.metaKey || e.ctrlKey){
            paste();
            return;
          }
        case 'm':
        case 'M':
          setSettings({...settingsRef.current,currentTool:'move'});
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopImmediatePropagation();
          sprite.previousFrame();
          setSprites(prev => (
            [...prev]
          ));
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopImmediatePropagation();
          sprite.nextFrame();
          setSprites(prev => (
            [...prev]
          ));
          break;
        case ' ':
          e.preventDefault();
          e.stopImmediatePropagation();
          settingsRef.current.playing?stop():play();
          break;
        case 'Shift':
          setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1});
          break;
      }
    }
  }
  function handleKeyUp(e){
    if((e.target === document.body)){
      switch(e.key){
        case 'Shift':
          setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1});
          break;
      }
    }
  }

  function downloadAllFramesAsBMPs(){
    //create a new JSZip object
    zip.current = new JSZip();

    const tempCanvas = document.createElement('canvas');
    const fileName = spritesRef.current[0].fileName.split('_')[0];
    //call this function recursively, when each file is zipped it zips the next one!
    const addFilesToZip = (spriteIndex,frameIndex) => {
      const sprite = spritesRef.current[spriteIndex];
      tempCanvas.width = sprite.width;
      tempCanvas.height = sprite.height;
      renderFrame(tempCanvas.getContext('2d'),sprite,frameIndex,{x:0,y:0});
      CanvasToBMP.toBlob(tempCanvas,(blob) => {
        const filename = sprite.fileName+'_'+(frameIndex+1)+'.bmp';
        zip.current.file(filename,blob);
        if(frameIndex < sprite.frames.length-1){
          addFilesToZip(spriteIndex,frameIndex+1);
        }
        else if(spriteIndex < (spritesRef.current.length-1)){
          addFilesToZip(spriteIndex+1,0);
        }
        else{
          downloadZip(fileName);
          tempCanvas.remove();
        }
      });
    }
    addFilesToZip(0,0);
  }

  function downloadSingleFrameAsBMP(frame){
    const sprite = spritesRef.current[currentSpriteRef.current];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sprite.width;
    tempCanvas.height = sprite.height;
    renderFrame(tempCanvas.getContext('2d'),sprite,frame,{x:0,y:0});
    CanvasToBMP.toBlob(tempCanvas,(blob) => {
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = sprite.fileName+'_'+(frame+1)+'.bmp';;
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      tempCanvas.remove();
    });
  }
  function downloadZip(fileName){
    zip.current.generateAsync({type : 'blob' }).then((content) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = fileName+'.zip';
      a.click();
      a.remove();
    });
  }

  // outputs a link for each frame
  function FrameDownloadLinks(){
    const children = [];
    const sprite = sprites[currentSprite];
    for(let frame = 0; frame<sprite.frames.length; frame++){
      children.push(<p key = {frame} className = "download_link" style = {{color:'blue',textDecoration:'underline',cursor:'pointer'}} onClick = {(e) => downloadSingleFrameAsBMP(frame)}>{sprite.fileName+'_'+(frame+1)+'.bmp'}</p>);
    }
    return(
      <div style = {{display:'flex',flexDirection:'column',width:'fit-content',border:'1px solid',borderRadius:'10px',paddingLeft:'10px',paddingRight:'10px',height:'fit-content',maxHeight:'400px',overflowY:'scroll'}}>
        {children}
      </div>
    )
  }

  const ToolButton = function({style,tooltip,state,onClick,src,text}){
    const buttonStyle = style?style:{};
    buttonStyle.backgroundColor = state?'blue':null;
    buttonStyle.color = state?'white':null;
    buttonStyle.minWidth = '20px'
    buttonStyle.minHeight = '20px'
    return(
      <div className = "button" style = {buttonStyle} onClick = {onClick}>{src && <img className = "tool_icon" src = {src}></img>}{text && <div>{text}</div>}</div>
    )
  }

  const ByteArrayText = function(){
    const sprite = sprites[currentSprite];
    const pixelArray = [...sprite.frames[sprite.currentFrame].data];
    let byteArray;

    if(settings.bytePackingFormat == 'horizontal'){
      //move down the image, grabbing 8px at a time along the row and padd the end with zeroes
      byteArray = new Uint8Array(pixelArray.length/8);
      let count = 0;
      for(let y = 0; y<sprite.height; y++){
        for(let x = 0; x<sprite.width; x+=8){
          let newByte = 0;
          for(let i = 0; i<8; i++){
            let bitVal;
            if(x+i > sprite.width)
              bitVal = 0;
            else bitVal = pixelArray[x+i+y*(sprite.width)];
            newByte |= bitVal<<(7-i);
          }
          byteArray[count++] = newByte;
        }
      }
    }
    else{
      //Do a pass L-->R, taking one-byte deep (8px) vertical slices. Then do another pass, going another layer deep.
      //This is to pass the data to tamo as "pages", which is how the OLED driver works

      //normalize the image to be a multiple of 8 tall
      if(sprite.height%8){
        const padHeight = 8-sprite.height%8;
        for(let i = 0; i<padHeight; i++){
          for(let j = 0; j<sprite.width; j++){
            pixelArray[pixelArray.length] = 0;
          }
        }
      }
      byteArray = new Uint8Array(pixelArray.length/8);
      let count = 0;
      for(let bite = 0; bite<Math.ceil(sprite.height/8); bite++){
        for(let x = 0; x<sprite.width; x++){
          let newByte = 0;
          for(let i = 0; i<8; i++){
            newByte |= pixelArray[i*sprite.width+x+bite*sprite.width*8]<<i;
          }
          byteArray[count++] = newByte;
        }
      }
    }

    let outputString = `//${sprite.fileName}_${sprite.currentFrame}: ${sprite.width}x${sprite.height}\rconst unsigned char ${sprite.fileName}[${byteArray.length}] PROGMEM = {\n\t`;
    for(let byte = 0; byte<byteArray.length;byte++){
      outputString+='0x'+byteArray[byte].toString(16).padStart(2,'0')+', ';
      if(((byte%16) == 15) && byte != byteArray.length-1){
        outputString += "\n\t";
      }
    }
    outputString = outputString.slice(0,-2);
    outputString += '\n};\n';
    
    return(
      <>
        <div>pack bytes:</div>
        <div style = {{display:'flex'}}>
          <div style = {{cursor:'pointer',padding:'5px 10px',borderRadius:'10px',color:settings.bytePackingFormat=='horizontal'?'white':null,backgroundColor:settings.bytePackingFormat=='horizontal'?'blue':null}} onClick = {(e)=>{setSettings({...settingsRef.current,bytePackingFormat:'horizontal'})}}>horizontally</div>
          <div style = {{cursor:'pointer',padding:'5px 10px',borderRadius:'10px',color:settings.bytePackingFormat=='vertical'?'white':null,backgroundColor:settings.bytePackingFormat=='vertical'?'blue':null}} onClick = {(e)=>{setSettings({...settingsRef.current,bytePackingFormat:'vertical'})}}>vertically</div>
        </div>
        <div style = {{border:'1px dashed blue',marginTop:'10px',borderRadius:'10px',padding:'10px',maxWidth:"350px"}}>{outputString}</div>
      </>
    )
  }

  function play(){
    //copy the current settings
    backupSettingsRef.current = {
      ...settingsRef.current
    }
    setSettings({
      ...settingsRef.current,
      playing:true,
      overlayGhosting:false,
      overlayGrid:false
    });
    playNextFrame();
  }
  function stop(){
    setSettings({
      ...settingsRef.current,
      playing:false,
      overlayGhosting:backupSettingsRef.current.overlayGhosting,
      overlayGrid:backupSettingsRef.current.overlayGrid,
    });
    window.clearTimeout(timeoutIDRef.current);
    timeoutIDRef.current = null;
  }

  // gets images and turns them into anim frames
  function loadFiles(fileList,sprite,startFrame){
    pushUndoState();
    if(fileList.length === 1){
      fileList = [fileList[0]];
    }
    fileList.map((file,index)=>{
      if(file.type === 'image/gif'){
        gifToSprite(file,(frames) => {
          const sprite = spritesRef.current[currentSpriteRef.current+index];
          sprite.frames = frames;
          sprite.width = frames[0].width;
          sprite.height = frames[0].height;
          setSprites([...spritesRef.current]);
        });
      }
      else{
        const reader = new FileReader();
        //callback once the file is read
        reader.onload = function () {
          //make an image, draw it to canvas
          const img = new Image();
          img.onload = function(){
            if(settingsRef.current.resizeCanvasToImage){
              const aspectRatio = img.width/img.height;
              if(img.width>img.height){
                if(img.width>settingsRef.current.maxCanvasDimension){
                  img.width = settingsRef.current.maxCanvasDimension;
                  img.height = img.width / aspectRatio;
                }
              }
              else if(img.height>=img.width){
                if(img.height>settingsRef.current.maxCanvasDimension){
                  img.height = settingsRef.current.maxCanvasDimension;
                  img.width = img.height * aspectRatio;
                }
              }
              sprite.resize(img.width,img.height);
              const newScale = Math.min(Math.trunc(350 / img.width),12);
              setSettings({...settingsRef.current,canvasScale:newScale,overlayGrid:((img.width*img.height)<1024)?true:false});
            }
            // draw image to main canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sprite.width;
            tempCanvas.height = sprite.height;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            //make new frames as needed
            while(index>=sprite.frames.length){
              sprite.frames.push(PixelFrame(sprite.width,sprite.height,0));
            }
            //copy canvas data
            sprite.frames[startFrame?(index+startFrame):index].copyCanvas(tempCanvas,settingsRef.current.useAlphaAsBackground);
            tempCanvas.remove();
            setSprites(prev => (
              [...prev]
            ));
          }
          img.src = reader.result;
        }
        reader.readAsDataURL(file);
      }
    });
  }
  function loadImage(files){
    //parsing files by name
    if(settingsRef.current.parseFilesToSpritesByName){
      const filesByName = [];
      let similarFiles = [];
      let currentSpriteName = files[0].name.split('_')[2];
      for(let file of files){
        //if this file is similar to the last one
        if(file.name.split('_')[2] === currentSpriteName){
          similarFiles.push(file);
        }
        //if this file doesn't match the last one
        else{
          //add the files to the filesByName array
          filesByName.push([...similarFiles]);

          //start a new similarFiles array with this file
          currentSpriteName = file.name.split('_')[2];
          similarFiles = [file];
        }
      }
      //push the remaining files!
      filesByName.push([...similarFiles]);
      const newSprites = [];
      for(let fileList of filesByName){
        const newSprite = Sprite();
        newSprite.fileName = fileList[0].name.split(/_(?!.*_)/)[0];
        loadFiles(fileList,newSprite);
        newSprites.push(newSprite);
      }
      setCurrentSprite(0);
      setSprites(prev => (
        [...newSprites]
      ));
      return;
    }
    else{
      //load files like normal, into the current sprite
      loadFiles(files,spritesRef.current[currentSpriteRef.current],(files.length === 1)?spritesRef.current[currentSpriteRef.current].currentFrame:0);
      setSprites(prev => (
        [...prev]
      ));
    }
  }

  function canvasCursor(){
    switch(settings.currentTool){
      case 'pixel':
      case 'fill':
      case 'select':
      case 'line':
        return 'pointer';
      case 'move':
        return 'move';
    }
  }

  function getTotalImageDataSize(){
    const sprite = sprites[currentSprite];
    return Math.ceil(sprite.width*sprite.height/8) * sprite.frames.length;
  }
  function resizeCanvasToNewDimensions(){
    const sprite = sprites[currentSprite];
    sprite.resize(userInputDimensionsRef.current.width,userInputDimensionsRef.current.height);
    setSprites(prev => (
      [...prev]
    ));
  }

  function addNewSprite(){
    pushUndoState();
    const newSprite = Sprite();
    setSprites(prev => (
      [...prev,newSprite]
    ));
    setCurrentSprite(spritesRef.current.length);
  }

  function deleteSprite(index){
    pushUndoState();
    setSprites(prev => {
      if (prev.length <= 1)
        return prev;

      //remove target sprite
      const newSprites = prev.filter((_,i) => i != index);
      //new current sprite
      const newCurrent = Math.min(currentSpriteRef.current, newSprites.length - 1);
      
      setCurrentSprite(newCurrent);
      return newSprites;
    });
  }


  function createSpritesheetTabs(sprites,currentTab){
    const tabs = [];
    sprites.map((tab,index) => {
      const tabStyle = {
        width:'fit-content',
        borderRadius:'10px 10px 0px 0px',
        padding:'4px',
        display:'flex',
        alignItems:'center',
      };
      if(index === currentTab){
        tabStyle.borderBottom = '1px solid white';
        tabStyle.borderLeft = '1px solid black';
        tabStyle.borderRight = '1px solid black';
        tabStyle.borderTop = '1px solid black';
        tabStyle.backgroundColor = 'white';
      }
      else{
        tabStyle.borderBottom = '1px solid black';
      }
      tabs.push(<div className = "spritesheet_tab" style = {tabStyle} key = {tab.id} 
        onClick = {()=>{
          setCurrentSprite(index);
      }}>
        <TabTitle key={tab.id+"_textarea"} value={tab.fileName} callbackFn={(e) => {
            const sprite = tab;
            sprite.fileName = e.target.value;
            setSprites(prev => (
              [...prev]
            ));
        }}></TabTitle>
        {sprites.length > 1 &&
          <div className = "delete_button" onClick = {()=>{deleteSprite(index)}}>{" x "}</div>
        }
        </div>);
    });
    tabs.push(<div key = {tabs.length} className = "button" onClick = {addNewSprite}>{" + "}</div>);
    return(
      <div className = "spritesheet_tabs_container">
        {tabs}
      </div>
    );
  }

  function createPreviewCanvases(){
    return sprites[currentSprite].frames.map((frame,index) => {

      //doing some bounds checking on the preview dimensions so they don't get huge
      const aspectRatio = sprites[currentSprite].height/sprites[currentSprite].width;
      let scaledWidth = sprites[currentSprite].width*2;
      let scaledHeight = sprites[currentSprite].height*2;

      const maxPreviewDim = 64;

      if((scaledHeight > scaledWidth) && scaledHeight>maxPreviewDim){
        scaledHeight = maxPreviewDim;
        scaledWidth = maxPreviewDim/aspectRatio;
      }
      else if((scaledHeight <= scaledWidth) && scaledWidth>maxPreviewDim){
        scaledWidth = maxPreviewDim;
        scaledHeight = maxPreviewDim*aspectRatio;
      }

      return(
      <div className = "preview_canvas_holder" key = {index+'_canvas_holder'} style = {{position:'relative',width:'fit-content',height:'fit-content'}}>
        <canvas key = {index+'_canvas'} className = "preview_canvas" 
            style = {{borderColor:(index == sprites[currentSprite].currentFrame)?'#0000ffff':'inherit',cursor:'pointer',imageRendering:'pixelated',width:scaledWidth+'px',height:scaledHeight+'px'}} 
            ref = 
            {(el)=>{
              if(el){
                const ctx = el.getContext('2d');
                el.width = sprites[currentSprite].width;
                el.height = sprites[currentSprite].height;
                renderFrame(ctx,sprites[currentSprite],index,{x:0,y:0});
              }
            }}
            onClick = {(e)=>{
              const sprite = spritesRef.current[currentSpriteRef.current];
              sprite.currentFrame = index;
              // force React to rerender
              setSprites(prev => (
                [...prev]
              ));
            }
          }>
          </canvas>
          {sprites[currentSprite].frames.length > 1 &&
            <div key = {index+'_delete_button'} className = "button" style = {{whiteSpace:'pre',justifyContent:'center',alignItems:'center',display:'flex',position:'absolute',top:'-5px',right:'-5px',width:'15px',height:'15px',borderRadius:'5px',margin:'0px'}}onClick = {()=>{deleteFrame(index)}}>{'x'}</div>
          }
        </div>);
    });
  }

  const canvasBorderImageStyle = {
    position:'absolute',
    width:(sprites[currentSprite].width*2)*settings.canvasScale+'px',
    height:(sprites[currentSprite].height*2)*settings.canvasScale+'px',
    marginLeft:-((sprites[currentSprite].width)*settings.canvasScale)/2+'px',
    marginTop:-((sprites[currentSprite].height)*settings.canvasScale)*0.45+'px'
  }

  const mainCanvasStyle = {
    position:'absolute',
    cursor:canvasCursor(),
    imageRendering:'pixelated',
    width:sprites[currentSprite].width*settings.canvasScale +'px',
    height:sprites[currentSprite].height*settings.canvasScale +'px',
    gridArea:'canvas',
    pointerEvents: 'auto',
  };

  const canvasContainerStyle = {
    display:'block',
    pointerEvents:'none',
    marginLeft:(sprites[currentSprite].width)/2+'px',
    marginRight:(sprites[currentSprite].width)/2+'px',
    marginTop:0,
    marginBottom:(sprites[currentSprite].height)/2+'px',
    width:sprites[currentSprite].width*settings.canvasScale +'px',
    height:sprites[currentSprite].height*settings.canvasScale +'px',
    filter:(typeof window.safari === "undefined")?'drop-shadow(4px 4px 2px #46788b)':'none'
  };

  function GifExporter() {
    const generateGif = async () => {
      const sprite = spritesRef.current[currentSpriteRef.current];
      const canvases = [];
      sprite.frames.map((frame,index)=>{
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sprite.width;
        tempCanvas.height = sprite.height;
        renderFrame(tempCanvas.getContext('2d'),sprite,index,{x:0,y:0});
        canvases.push(tempCanvas);
      });
      const gifBlob = await canvasesToGif(canvases, settingsRef.current.frameSpeed);
      for(let canvas of canvases){
        canvas.remove();
      }
      const url = URL.createObjectURL(gifBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sprite.fileName+'.gif';
      a.click();
      a.remove();
    };

    return (
      <div className = "button" onClick={generateGif}>{'save gif (.gif)'}</div>
    );
  }

  function clearTooltip(){
    setSettings({...settingsRef.current,tooltip:null});
  }
  const gridOverlayStyle = {
    pointerEvents:'none',
    position:'absolute',
    width:sprites[currentSprite].width*settings.canvasScale +'px',
    height:sprites[currentSprite].height*settings.canvasScale +'px',
    zIndex:5,
    display: 'grid',
    background:`
      linear-gradient(#4f4f4f 1px, transparent 1px),
      linear-gradient(90deg, #4f4f4f 1px, transparent 1px)`,
    backgroundSize: `${100/sprites[currentSprite].width}% ${100/sprites[currentSprite].height}%`
  }


  return (
    <div className = "center_container">
      <div className = "app_container">
        {/* title image, gifs */}
        <div id = "title_container">
          <img id = "title_image" className = "transparent_img_drop_shadow" style = {{width:'200px'}} src = 'title.gif'/>
          <img id = "gif_1" className = "title_gif " src = 'tamo_idle.gif' style = {{left:'-55px',top:'-40px'}} ></img>
          <img id = "gif_2" className = "title_gif " src = 'porcini_happy.gif' style = {{left:'195px',top:'-40px'}} ></img>
          <img id = "gif_3" className = "title_gif " src = 'bug_angry.gif' style = {{left:'-70px',top:'40px'}} ></img>
          <img id = "gif_4" className = "title_gif " src = 'boto_sad.gif' style = {{left:'210px',top:'40px'}} ></img>
        </div>
        {/* grid overlay, border image, and main canvas */}
        <div id = "canvas_container_container">
          <div id = "canvas_container" style = {canvasContainerStyle}>
            <canvas id = "main_canvas" style = {mainCanvasStyle} ref = {mainCanvasRef} onMouseEnter = {() => setSettings({...settingsRef.current,tooltip:settingsRef.current.currentTool})} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}  onMouseLeave = {handleMouseLeave} onTouchEnd={handleMouseUp} onTouchCancel={handleMouseUp} onTouchMove={handleMouseMove}></canvas>
            {settings.overlayGrid && 
              <div className = "canvas_overlay_grid" style = {gridOverlayStyle}></div>
            }
            {(sprites[currentSprite].width <= 32) && (sprites[currentSprite].height <= 32) && (settings.canvasScale*sprites[currentSprite].width<=256) &&
            <img id = "canvas_border" className = "transparent_img_drop_shadow" src = 'border_animated.gif' style = {canvasBorderImageStyle}></img>
            }
            {(selectionBox.active || selectionBox.hasStarted) &&
              <div id = "selection_box" style = {selectionBoxStyle}></div>
            }
          </div>
        </div>

        {/* spritesheet tabs */}
        {createSpritesheetTabs(sprites,currentSprite)}

        {/* ui */}
        <div className = "ui_container">
          {/* preview canvases */}
          <div className = "ui_label" style = {{fontWeight:'bold',fontSize:'15px',marginTop:'5px'}}>frame -- {sprites[currentSprite].currentFrame+1} / {sprites[currentSprite].frames.length}</div>
          <div id = "preview_gallery_holder" style = {{display:'flex',alignItems:'center',width:'300px',flexWrap:'wrap',height:'fit-content',overflowY:'scroll',marginTop:'5px',padding:'4px',borderRadius:'10px',border:'1px dashed black'}}>
            {createPreviewCanvases()}
            <div className = "button" onClick = {addNewFrame}>{" + "}</div>
          </div>
          
          {/* frame editing */}
          <div className = "button_holder">
            <ToolButton tooltip = {settings.playing?"pause":"play"} state = {settings.playing} src={settings.playing?"pause_icon.gif":"play_icon.bmp"} onClick = {settings.playing?()=>{stop();}:()=>{play();}}/>
            <ToolButton tooltip = "duplicate frame" state = {false} src={"duplicate_icon.gif"} onClick = {()=>{duplicateFrame(spritesRef.current[currentSpriteRef.current].currentFrame)}}/>
            <ToolButton tooltip = "reverse order" state = {false} src={"reorder_icon.gif"} onClick = {reverseFrames}/>
          </div>
          <div className = "button_holder" style = {{alignItems:'center'}}>
            <input inputMode = "numeric" type="number" style = {{backgroundColor:(userInputDimensions.width != sprites[currentSprite].width)?'blue':'white',color:(userInputDimensions.width != sprites[currentSprite].width)?'white':'inherit'}} className = "dimension_input" id="width_input" name="width" min="1" max={settings.maxCanvasDimension} onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,width:parseInt(e.target.value)})}} defaultValue={sprites[currentSprite].width} onMouseLeave = {clearTooltip} onMouseEnter = {() => setSettings({...settingsRef.current,tooltip:'sprite width'})}/>
            <p style = {{fontStyle:'italic',fontFamily:'times'}}>x</p>
            <input inputMode = "numeric" type="number" style = {{backgroundColor:(userInputDimensions.height != sprites[currentSprite].height)?'blue':'white',color:(userInputDimensions.height != sprites[currentSprite].height)?'white':'inherit'}} className = "dimension_input" id="height_input" name="height" min="1" max={settings.maxCanvasDimension} onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,height:parseInt(e.target.value)})}} defaultValue={sprites[currentSprite].height} onMouseLeave = {clearTooltip} onMouseEnter = {() => setSettings({...settingsRef.current,tooltip:'sprite height'})}/>
            {(userInputDimensions.height != sprites[currentSprite].height || userInputDimensions.width != sprites[currentSprite].width) &&
              <div className = "button" onClick = {resizeCanvasToNewDimensions}>resize</div>
            }
            <div className = "button_holder" style = {{flexDirection:'column',width:'fit-content'}}>
              <div style = {{fontStyle:'italic',margin:'auto',marginBottom:'-10px',}}>zoom</div>
              <div className = "button_holder" style = {{}}>
                <input type="range" style = {{width:'100px'}} onMouseLeave = {clearTooltip} onMouseEnter = {() => setSettings({...settingsRef.current,tooltip:'canvas zoom'})} className = "control_slider" id="canvas_scale_slider" name="ms" min="1" max="32" step="1" value = {settings.canvasScale} onInput={(e) => {
                    const newScale = parseFloat(e.target.value);
                    setSettings({...settingsRef.current,canvasScale:newScale});
                  }} />
                <p>{settings.canvasScale+'x'}</p>
              </div>
              </div>
          </div>
          {(userInputDimensions.width > 64 || userInputDimensions.height > 32) &&
            <p style = {{fontStyle:'italic',color:'red'}}>fyi: tamo's screen only supports 64x32 sprites</p>
          }

          {/* pixel/canvases manipulation tools */}
          {/* tooltip */}
          <div className = "ui_label" style = {{fontWeight:'bold',fontSize:'15px'}}>tools{settings.tooltip && <>  -- {settings.tooltip}</>}{settings.tooltip === null && <> -- {settings.currentTool}</>}{currentMouseCoords &&` [${currentMouseCoords.x},${currentMouseCoords.y}]`}</div>
          <div className = "button_holder">
            <div className = "button" style = {{border:'1px solid black',backgroundColor:settings.currentColor == 1?settings.foregroundColor:settings.backgroundColor,width:'20px',height:'20px'}} onClick = {() => {setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1})}}>{"  "}</div>
            <ToolButton tooltip = "draw pixels" state = {settings.currentTool === 'pixel'} src={"pixel_icon.gif"} onClick = {() => setSettings({...settingsRef.current,currentTool:'pixel'})}/>
            <ToolButton tooltip = "draw lines" state = {settings.currentTool === 'line'} src={"line_icon.gif"} onClick = {() => setSettings({...settingsRef.current,currentTool:'line'})}/>
            <ToolButton tooltip = "fill" state = {settings.currentTool === 'fill'} src={"fill_icon.gif"} onClick = {() => setSettings({...settingsRef.current,currentTool:'fill'})}/>
          </div>
          <div className = "button_holder">
            <ToolButton tooltip = "select" state = {settings.currentTool === 'select'} src={"select_icon.gif"} onClick = {() => setSettings({...settingsRef.current,currentTool:'select'})}/>
            <ToolButton tooltip = "move" state = {settings.currentTool == 'move'} src={"move_icon.gif"} onClick = {() => {setSettings({...settingsRef.current,currentTool:'move'})}}/>
            <ToolButton tooltip = "clear frame" state = {false} src={"clear_icon.gif"} onClick = {clearFrame}/>
            <ToolButton style = {{filter:undoBuffer.current.length == 0?'contrast(80%)':null,color:undoBuffer.current.length == 0?'#c2c2c2ff':null,borderColor:undoBuffer.current.length == 0?'#c2c2c2ff':null,backgroundColor:undoBuffer.current.length == 0?'white':null,cursor:undoBuffer.current.length == 0?'not-allowed':null}} tooltip = "undo" state = {false} src={undoBuffer.current.length?"undo_icon.gif":"undo_icon.bmp"} onClick = {undo}/>
            <ToolButton style = {{filter:redoBuffer.current.length == 0?'contrast(80%)':null,color:redoBuffer.current.length == 0?'#c2c2c2ff':null,borderColor:redoBuffer.current.length == 0?'#c2c2c2ff':null,backgroundColor:redoBuffer.current.length == 0?'white':null,cursor:redoBuffer.current.length == 0?'not-allowed':null}} tooltip = "redo" state = {false} src={redoBuffer.current.length?"redo_icon.gif":"redo_icon.bmp"} onClick = {redo}/>
          </div>
          <div className = "button_holder">
            <ToolButton tooltip = "invert" state = {false} text = " invert " onClick = {invertFrame}/>
            <ToolButton tooltip = "mirror horizontally" state = {false} text = " ⇠⇢ " onClick = {mirrorHorizontally}/>
            <ToolButton tooltip = "mirror vertically" state = {false} text = " ⇡⇣ " onClick = {mirrorVertically}/>
            <ToolButton tooltip = "open color pallette" state = {settings.palletteOpen} text = " pallette " onClick = {()=> setSettings({...settingsRef.current,palletteOpen:!settingsRef.current.palletteOpen})}/>
          </div>
          {settings.palletteOpen &&
            <div className = "button_holder"style = {{display:'flex',padding:'10px',marginTop:'10px',borderRadius:'30px',backgroundColor:'black',width:'fit-content'}}>
              <div className = "button_holder" style = {{flexDirection:'column'}}>
                <div className = "button" style = {{padding:'4px',width:'fit-content',height:'fit-content'}} onClick = {(e)=>{setSettings({...settingsRef.current,backgroundColor:'#00000000',foregroundColor:'#000000ff',overlayColor:'#bcbcbcff'})}}>{" black/transp."}</div>
                <div className = "button" style = {{padding:'4px',width:'fit-content',height:'fit-content'}} onClick = {(e)=>{setSettings({...settingsRef.current,backgroundColor:'#00000000',foregroundColor:'#ffffffff',overlayColor:'#bcbcbcff'})}}>{" white/transp."}</div>
                <div className = "button" style = {{padding:'4px',width:'fit-content',height:'fit-content'}} onClick = {(e)=>{setSettings({...settingsRef.current,backgroundColor:'#000000ff',foregroundColor:'#ffffffff',overlayColor:'#4b4b4bff'})}}>{" white/black "}</div>
                <div className = "button" style = {{padding:'4px',width:'fit-content',height:'fit-content'}} onClick = {(e)=>{setSettings({...settingsRef.current,backgroundColor:'#ffffffff',foregroundColor:'#000000ff',overlayColor:'#bcbcbcff'})}}>{" black/white "}</div>
              </div>
              <div className = "button_holder">
                <ColorPicker label = "background" callback = {(val)=>{setSettings({...settingsRef.current,backgroundColor:val})}} value = {settings.backgroundColor}></ColorPicker>
                <ColorPicker label = "foreground" callback = {(val)=>{setSettings({...settingsRef.current,foregroundColor:val})}} value = {settings.foregroundColor}></ColorPicker>
              </div>
            </div>
          }
          {/* playback speed slider */}
          <div className = "button_holder" style = {{flexDirection:'column',width:'fit-content'}}>
            <div style = {{fontStyle:'italic',margin:'auto',marginBottom:'-12px',}}>frame delay</div>
            <div className='button_holder'>
              <input type="range" className = "control_slider" id="frame_speed_slider" name="ms" min="100" max="1000" step="100" onInput={(e) => {window.clearTimeout(timeoutIDRef.current);setSettings({...settingsRef.current,frameSpeed:parseInt(e.target.value)});if(settingsRef.current.playing){
                timeoutIDRef.current = window.setTimeout(playNextFrame,parseInt(e.target.value));
              }}} />
              <p>{settings.frameSpeed+'ms'}</p>
            </div>
          </div>

          {/* drop zone */}
          {/* <label id="drop-zone">
            Drop images here, or click to upload.
            <input type="file" id="file-input" multiple accept="image/*" style = {{display:'none'}} onInput={(e) => {loadImage(e.target.files)}} />
          </label> */}
          <DropZone title = "Drop images here, or click to upload." callback = {(files) => {loadImage(files)}}></DropZone>

          {/* settings */}
          <div className = 'button_holder'>
            <GifExporter/>
            <div className = "button" onClick = {downloadAllFramesAsBMPs}>{'save zip (.bmp)'}</div>
            <div className = "button" style = {{backgroundColor:settings.settingsBoxOpen?'blue':'white',color:settings.settingsBoxOpen?'white':'inherit'}} onClick = {()=> setSettings({...settingsRef.current,settingsBoxOpen:!settingsRef.current.settingsBoxOpen})}>{" settings "}</div>
          </div>
          {settings.settingsBoxOpen &&
          <div style = {{width:'350px',padding:'10px'}}>
            <div className = "ui_label" style = {{paddingTop:'10px'}}>settings:</div>
            <div className = "button_holder" style = {{border:'1px dashed black',borderRadius:'10px',flexDirection:'column'}}>
              <Setting text = 'C++ byte array' callback = {() => {setSettings({...settingsRef.current,renderByteArray:!settingsRef.current.renderByteArray});}} state = {settings.renderByteArray}/>
              <Setting text = 'ghosting' callback = {() => {setSettings({...settingsRef.current,overlayGhosting:!settingsRef.current.overlayGhosting});}} state = {settings.overlayGhosting}/>
              <Setting text = 'grid' callback = {() => {setSettings({...settingsRef.current,overlayGrid:!settingsRef.current.overlayGrid});}} state = {settings.overlayGrid}/>
              <Setting text = 'background overwrites foreground when moving' callback = {() => {setSettings({...settingsRef.current,overwriteWithBackground:!settingsRef.current.overwriteWithBackground});}} state = {settings.overwriteWithBackground}/>
            </div>
            <div className = "ui_label" style = {{paddingTop:'10px'}}>uploading images:</div>
            <div className = "button_holder" style = {{border:'1px dashed black',borderRadius:'10px',flexDirection:'column'}}>
              <Setting text = 'resize canvas to new image' callback = {() => {setSettings({...settingsRef.current,resizeCanvasToImage:!settingsRef.current.resizeCanvasToImage});}} state = {settings.resizeCanvasToImage}/>
              <Setting text = 'treat transparency as background' callback = {() => {setSettings({...settingsRef.current,useAlphaAsBackground:!settingsRef.current.useAlphaAsBackground});}} state = {settings.useAlphaAsBackground}/>
              <Setting text = 'organize & create sprites based on filenames' callback = {() => {setSettings({...settingsRef.current,parseFilesToSpritesByName:!settingsRef.current.parseFilesToSpritesByName});}} state = {settings.parseFilesToSpritesByName}/>
            </div>
          </div>
          }
        </div>

        {/* download links */}
        <div id = "download_link_container" style = {{gridArea:(settings.canvasScale*sprites[currentSprite].width<=384)?'downloadlinks':'downloadlinks_2'}}>
          <p style = {{padding:'none',marginBottom:'0px',fontFamily:'chopin',fontWeight:'normal',fontSize:'20px'}}>Name Prefix:</p>
          <textarea id = "sprite_name_textarea" style = {{display:'block',fieldSizing:'content',height:'1em',borderRadius:'6px',backgroundColor:'blue',color:'white',padding:'4px',resize:'none',alignContent:'center'}} onInput={(e) => 
            {
              e.preventDefault();
              const sprite = spritesRef.current[currentSpriteRef.current];
              sprite.fileName = e.target.value;
              setSprites(prev => (
                [...prev]
              ));
            }} value = {sprites[currentSprite].fileName}/>
          <FrameDownloadLinks></FrameDownloadLinks>
          <div style = {{dispaly:'flex'}}>
            <p>{'('+getTotalImageDataSize()+' bytes of pixel data)'}</p>
          </div>
          {settings.renderByteArray &&
            <ByteArrayText></ByteArrayText>
          }
        </div>
        <div id = "about">
          <div style = {{display:'block'}}>
            <a href = "https://alexlafetra.github.io/" style = {{fontFamily:'Times New Roman'}}>alex lafetra</a> for <a style = {{fontStyle : 'italic',fontFamily:'Times New Roman'}} href = "https://alexlafetra.github.io/">2x_ultd.</a>
          </div>
          {/* <div>this website</div> */}
        </div>
      </div>
    </div>
  )
}

export default App