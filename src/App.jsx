import { useState , useEffect , useRef} from 'react'
import './main.css';
import JSZip from 'jszip'
import { Sprite , PixelFrame } from './Sprite';
import { ColorPicker } from './components/ColorPicker';
import { TabTitle } from './components/TabTitle';
import { SelectionBox } from './SelectionBox';


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
    currentColor:1,//1 for white, 0 for black
    canvasScale:12,
    playing:false,
    lineStarted:false,
    moveStarted:false,
    overwriteWithBackground:false,
    parseFilesToSpritesByName:false,
    useAlphaAsBackground:false,
    resizeCanvasToImage:true,
    maxCanvasDimension:128,
    palletteOpen:false,
    settingsBoxOpen:false,
    foregroundColor:'#ffffffff',
    backgroundColor:'#000000ff',
    overlayColor:'#4b4b4bff'
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
  const [currentMouseCoords,setCurrentMouseCoords] = useState({x:0,y:0});


  const [selectionBox,setSelectionBox] = useState(SelectionBox());
  const selectionBoxRef = useRef(selectionBox);
  const selectedArea = useRef(null);
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
    setGridDivs(createGridDivs(sprites[currentSprite].width,sprites[currentSprite].height,settingsRef.current.canvasScale));
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
  },[sprites,currentSprite,settings]);


  useEffect(() => {
    //add keyboard input event listener
    window.addEventListener("keydown",handleKeyDown);
    window.addEventListener("keyup",handleKeyUp);

    //add in drop zone listeners
    const dropZone = document.getElementById("drop-zone");
    window.addEventListener("drop", (e) => {
      if ([...e.dataTransfer.items].some((item) => item.kind === "file")) {
        e.preventDefault();
      }
    });
    dropZone.addEventListener("dragover", (e) => {
      const fileItems = [...e.dataTransfer.items].filter(
        (item) => item.kind === "file",
      );
      if (fileItems.length > 0) {
        e.preventDefault();
        if (fileItems.some((item) => item.type.startsWith("image/"))) {
          e.dataTransfer.dropEffect = "copy";
        } else {
          e.dataTransfer.dropEffect = "none";
        }
      }
    });
    window.addEventListener("dragover", (e) => {
      const fileItems = [...e.dataTransfer.items].filter(
        (item) => item.kind === "file",
      );
      if (fileItems.length > 0) {
        e.preventDefault();
        if (!dropZone.contains(e.target)) {
          e.dataTransfer.dropEffect = "none";
        }
      }
    });
    dropZone.addEventListener("drop", dropHandler);
  },[]);

  function getClickCoords(e){
    const sprite = spritesRef.current[currentSpriteRef.current];
    const dims = e.target.getBoundingClientRect();
    let clickCoords;
    if(e.type === 'touchmove'){
      clickCoords = {
        x:e.touches[0].pageX - dims.left,
        y:e.touches[0].pageY - dims.top
      };
    }
    else{
      clickCoords = {
        x:e.pageX - dims.left,
        y:e.pageY - dims.top
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
        const newFrames = sprite.frames;
        newFrames[sprite.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
        renderCurrentFrameToMainCanvas();
        break;
      case 'fill':{
        const newFrames = sprite.frames;
        newFrames[sprite.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
        renderCurrentFrameToMainCanvas();
      }
        break;
      case 'line':
        //make a backup of the line
        pixelSaveState.current = PixelFrame(sprite.width,sprite.height,sprite.frames[sprite.currentFrame].data);
        setSettings({
          ...settingsRef.current,
          lineStarted : true
        });
      case 'move':
        if(!settingsRef.current.moveStarted){
          //store the selected area
          if(selectionBox.active){
            selectedArea.current = PixelFrame(selectionBox.getWidth(),selectionBox.getHeight(),0);
            pixelSaveState.current = PixelFrame(sprite.width,sprite.height,sprite.frames[sprite.currentFrame].data);
            const bounds = {
              start: {x:Math.min(selectionBox.start.x,selectionBox.end.x),y:Math.min(selectionBox.start.y,selectionBox.end.y)},
              end: {x:Math.max(selectionBox.start.x,selectionBox.end.x),y:Math.max(selectionBox.start.y,selectionBox.end.y)}
            };
            //copy area into pixel array
            for(let x = 0; x<selectionBox.getWidth(); x++){
              for(let y = 0; y<selectionBox.getHeight(); y++){
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
  }
  function handleMouseMove(e){
    const coords = getClickCoords(e);
    setCurrentMouseCoords(coords);
    //detect if the mouse button is held down (necessary for dragging)
    if(e.buttons || (e.type === 'touchmove')){
      const sprite = spritesRef.current[currentSpriteRef.current];
      switch(settingsRef.current.currentTool){
        case 'pixel':
          sprite.frames[sprite.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
          renderCurrentFrameToMainCanvas();
          break;
        case 'line':
          //if you've already started a line, draw it
          if(settingsRef.current.lineStarted){
            sprite.frames[sprite.currentFrame] = PixelFrame(pixelSaveState.current.width,pixelSaveState.current.height,pixelSaveState.current.data);
            sprite.frames[sprite.currentFrame].drawLine(startClickCoords.current.x,startClickCoords.current.y,coords.x,coords.y,settingsRef.current.currentColor);
            renderCurrentFrameToMainCanvas();
          }
          break;
        case 'fill':{
          sprite.frames[sprite.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
          renderCurrentFrameToMainCanvas();
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
              // renderCurrentFrameToMainCanvas();
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
    // renderCurrentFrameToMainCanvas();
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
        let bgColor = settingsRef.current.backgroundColor;
        //if there's a previous frame, ghost it
        if(previousFrame !== undefined  && settingsRef.current.overlayGhosting){
          bgColor = sprite.frames[previousFrame].getPixel(x,y)?settingsRef.current.overlayColor:bgColor;
        }
        context.fillStyle = sprite.frames[sprite.currentFrame].getPixel(x,y)?settingsRef.current.foregroundColor:bgColor;
        context.fillRect(x,y,1,1);
      }
    }
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
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame] = PixelFrame(sprite.width, sprite.height, 0);
    setSprites(prev => (
      [...prev]
    ));
  }

  function invertFrame(){
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames[sprite.currentFrame].invert();
    setSprites(prev => (
      [...prev]
    ));
  }

  function addNewFrame(){
    const sprite = spritesRef.current[currentSpriteRef.current];
    sprite.frames = [...sprite.frames,PixelFrame(sprite.width, sprite.height, 0)];
    sprite.currentFrame = sprite.frames.length-1;
    //trigger rerender to remake previews
    setSprites(prev => (
      [...prev]
    ));
  }

  function duplicateFrame(frame){
    const sprite = spritesRef.current[currentSpriteRef.current];
    const newFrame = PixelFrame(sprite.width, sprite.height, 0);
    
    //copy over all the data (can't copy object ref)
    for(let i = 0; i<newFrame.data.length; i++){
      newFrame.data[i] = sprite.frames[frame].data[i];
    }
    const newFrames = [...sprite.frames];
    newFrames.splice(frame,0,newFrame);
    sprite.currentFrame = newFrames.length-1;
    sprite.frames = newFrames;
    //trigger rerender to recreate previews
    setSprites(prev => (
      [...prev]
    ));
  }

  function deleteFrame(){
    const sprite = spritesRef.current[currentSpriteRef.current];
    if(sprite.frames.length>1){
      const newFrames = sprite.frames.toSpliced(sprite.currentFrame,1);
      sprite.frames = newFrames;
      sprite.currentFrame = Math.min(sprite.currentFrame,sprite.frames.length-1);
      //trigger rerender to recreate previews
      setSprites(prev => (
        [...prev]
      ));
    }
  }

  function reverseFrames(){
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
          console.log(newVal);
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
    const tempCanvas = document.createElement('canvas');
    const fileName = spritesRef.current[0].fileName.split('_')[0];
    //call this function recursively, when each file is zipped it zips the next one!
    const addFilesToZip = (spriteIndex,frameIndex) => {
      const sprite = spritesRef.current[spriteIndex];
      tempCanvas.width = sprite.width;
      tempCanvas.height = sprite.height;
      renderFrame(tempCanvas.getContext('2d'),sprite,frameIndex,{x:0,y:0});
      tempCanvas.toBlob((blob) => {
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
    tempCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      const filename = sprite.fileName+'_'+(frame+1)+'.bmp';
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      a.remove();
      tempCanvas.remove();
    });
  }
  function downloadZip(fileName){
    zip.current.generateAsync({type : 'blob' }).then((content) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = fileName+'.zip';
      a.click();
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

  function BitmapText(){

  }

  function createGridDivs(width,height,scale){
    const children = [];
    const parentStyle = {
      width:width*scale + 'px',
      height:height*scale + 'px',
      display:'grid',
      position:'absolute',
      gridTemplateColumns:'repeat('+width+',1fr)',
      gridTemplateRows:'repeat('+height+',1fr)'
    }
    const borderStyle = '1px dashed #535889ff';
    for(let i = 0; i<width*height; i++){
      const childStyle = {
        width:((scale-1) - 1/width)+'px',
        height:((scale-1) - 1/height)+'px',
        border:'1px dashed transparent',
        borderLeft:'none',
        borderTop:'none'
      };
      childStyle.border = borderStyle;
      if((i%width) == 0){
        childStyle.borderLeft = borderStyle;
      }
      if(i<width){
        childStyle.borderTop = borderStyle;
      }
      children.push(<div key = {i} id = {"grid_div_"+i} className = "grid_div" style = {childStyle}></div>);
    }
    return(<div style = {parentStyle}>{children}</div>);
  }

  const [gridDivs,setGridDivs] = useState(()=>createGridDivs(16,16,settings.canvasScale));
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
  function dropHandler(ev) {
    const files = [...ev.dataTransfer.items]
      .map((item) => item.getAsFile())
      .filter((file) => file);
    loadImage(files);
  }

  function loadFiles(fileList,sprite,startFrame){
    if(fileList.length === 1){
      fileList = [fileList[0]];
    }
    fileList.map((file,index)=>{
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
            else if(img.height>img.width){
              if(img.height>settingsRef.current.maxCanvasDimension){
                img.height = settingsRef.current.maxCanvasDimension;
                img.width = img.height * aspectRatio;
              }
            }
            sprite.resize(img.width,img.height);
            const newScale = Math.min(Math.trunc(350 / img.width),12);
            setSettings({...settingsRef.current,canvasScale:newScale,overlayGrid:((img.width*img.height)<1024)?true:false});
            setGridDivs(createGridDivs(sprite.width,sprite.height,newScale));
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
    });
    setGridDivs(createGridDivs(sprite.width,sprite.height,settingsRef.current.canvasScale));
  }
  function loadImage(files){
    console.log(files);
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
    setGridDivs(createGridDivs(sprite.width,sprite.height,settingsRef.current.canvasScale));
  }

  function addNewSprite(){
    const newSprite = Sprite();
    setSprites(prev => (
      [...prev,newSprite]
    ));
    setCurrentSprite(spritesRef.current.length);
  }

  function deleteSprite(index){
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
        <div className = "button" onClick = {downloadAllFramesAsBMPs}>{"zip spritesheet"}</div>
      </div>
    );
  }

  function createPreviewCanvases(){
    return sprites[currentSprite].frames.map((frame,index) => {
      return <canvas key = {index} className = "preview_canvas" style = {{borderColor:(index == sprites[currentSprite].currentFrame)?'red':'inherit',cursor:'pointer',imageRendering:'pixelated',width:sprites[currentSprite].width*2+'px',height:sprites[currentSprite].height*2+'px'}} 
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
        </canvas>;
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
    boxShadow:'5px 5px 5px #46788b'
  };

  const canvasContainerStyle = {
    display:'block',
    position:'relative',
    gridArea:'canvas',
    pointerEvents:'none',
    marginLeft:((sprites[currentSprite].width)*settings.canvasScale)*0.2+'px',
    marginRight:((sprites[currentSprite].width)*settings.canvasScale)*0.2+'px',
    marginTop:0,
    marginBottom:((sprites[currentSprite].height)*settings.canvasScale)*0.2+'px',
    width:sprites[currentSprite].width*settings.canvasScale +'px',
    height:sprites[currentSprite].height*settings.canvasScale +'px',
  };

  return (
    <div className = "center_container">
      <div className = "app_container">
        {/* title image, gifs */}
        <div id = "title_container">
          <img id = "title_image" className = "transparent_img_drop_shadow" style = {{width:'200px'}} src = 'flipbook/title.gif'/>
          <img id = "gif_1" className = "title_gif " src = 'flipbook/tamo_idle.gif' style = {{left:'45px',top:'20px'}} ></img>
          <img id = "gif_2" className = "title_gif " src = 'flipbook/porcini_happy.gif' style = {{left:'255px',top:'20px'}} ></img>
          <img id = "gif_3" className = "title_gif " src = 'flipbook/bug_angry.gif' style = {{left:'15px',bottom:'0px'}} ></img>
          <img id = "gif_4" className = "title_gif " src = 'flipbook/boto_sad.gif' style = {{left:'295px',bottom:'0'}} ></img>
        </div>
        {/* grid overlay, border image, and main canvas */}
        <div id = "canvas_container" style = {canvasContainerStyle}>
          <canvas id = "main_canvas" style = {mainCanvasStyle} ref = {mainCanvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave = {handleMouseLeave} onTouchMove={handleMouseMove}></canvas>
          {settings.overlayGrid && gridDivs}
          {(sprites[currentSprite].width <= 32) && (sprites[currentSprite].height <= 32) &&
          <img id = "canvas_border" className = "transparent_img_drop_shadow" src = 'flipbook/border_transparent.png' style = {canvasBorderImageStyle}></img>
          }
          {(selectionBox.active || selectionBox.hasStarted) &&
            <div id = "selection_box" style = {selectionBoxStyle}></div>
          }
        </div>

        {/* spritesheet tabs */}
        {createSpritesheetTabs(sprites,currentSprite)}

        {/* ui */}
        <div className = "ui_container">
          {/* preview canvases */}
          <div id = "preview_gallery_holder" style = {{display:'flex',alignItems:'center',width:'300px',flexWrap:'wrap',height:'fit-content',overflowY:'scroll'}}>
            {createPreviewCanvases()}
          </div>
          <div>frame -- {sprites[currentSprite].currentFrame+1} / {sprites[currentSprite].frames.length}</div>
          
          {/* frame editing */}
          <div className = "button_holder">
            <div className = "button" onClick = {addNewFrame}>{" + "}</div>
            <div className = "button" onClick = {deleteFrame}>{" - "}</div>
            <div className = "button" onClick = {()=>{duplicateFrame(spritesRef.current[currentSpriteRef.current].currentFrame)}}>{" dupe "}</div>
            <div className = "button" onClick = {reverseFrames}>{"reverse"}</div>
            <div className = "button" onClick = {settings.playing?()=>{stop();}:()=>{play();}}>{settings.playing?"stop":"play"}</div>
          </div>
          <div style = {{display:'flex',alignItems:'center'}}>
            <input inputMode = "numeric" type="number" style = {{backgroundColor:(userInputDimensions.width != sprites[currentSprite].width)?'blue':'inherit',color:(userInputDimensions.width != sprites[currentSprite].width)?'white':'inherit'}} className = "dimension_input" id="width_input" name="width" min="1" max={settings.maxCanvasDimension} onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,width:parseInt(e.target.value)})}} defaultValue={sprites[currentSprite].width}/>
            <p style = {{fontStyle:'italic',fontFamily:'times'}}>x</p>
            <input inputMode = "numeric" type="number" style = {{backgroundColor:(userInputDimensions.height != sprites[currentSprite].height)?'blue':'inherit',color:(userInputDimensions.height != sprites[currentSprite].height)?'white':'inherit'}} className = "dimension_input" id="height_input" name="height" min="1" max={settings.maxCanvasDimension} onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,height:parseInt(e.target.value)})}} defaultValue={sprites[currentSprite].height}/>
            {(userInputDimensions.height != sprites[currentSprite].height || userInputDimensions.width != sprites[currentSprite].width) &&
              <div className = "button" onClick = {resizeCanvasToNewDimensions}>resize</div>
            }
            <input type="range" style = {{width:'100px'}}className = "control_slider" id="canvas_scale_slider" name="ms" min="1" max="12" step="1" value = {settings.canvasScale} onInput={(e) => {
                const newScale = parseFloat(e.target.value);
                setSettings({...settingsRef.current,canvasScale:newScale});
                setGridDivs(createGridDivs(spritesRef.current[currentSpriteRef.current].width,spritesRef.current[currentSpriteRef.current].height,newScale));
              }} />
            <p>{settings.canvasScale+'x'}</p>
          </div>
          {(userInputDimensions.width > 64 || userInputDimensions.height > 32) &&
            <p style = {{fontStyle:'italic',color:'red'}}>tamo's screen only supports 64x32 sprites</p>
          }

          {/* pixel/canvases manipulation tools */}
          <div>tools -- {settings.currentTool} {currentMouseCoords &&'['+currentMouseCoords.x+','+currentMouseCoords.y+']'}</div>
          <div className = "button_holder">
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'pixel'?'blue':'inherit',color:settings.currentTool == 'pixel'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'pixel'})}}>{" pixel "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'line'?'blue':'inherit',color:settings.currentTool == 'line'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'line'})}}>{" line "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'fill'?'blue':'inherit',color:settings.currentTool == 'fill'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'fill'})}}>{" fill "}</div>
          </div>
          <div className = "button_holder">
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'select'?'blue':'inherit',color:settings.currentTool == 'select'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'select'})}}>{" select "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'move'?'blue':'inherit',color:settings.currentTool == 'move'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'move'})}}>{" move "}</div>
          </div>
          <div className = "button_holder">
            <div className = "button" style = {{border:'1px solid black',backgroundColor:settings.currentColor == 1?settings.foregroundColor:settings.backgroundColor}} onClick = {() => {setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1})}}>{"  "}</div>
            <div className = "button" onClick = {clearFrame}>{"clear"}</div>
            <div className = "button" onClick = {invertFrame}>{" ^-1 "}</div>
            <div className = "button" style = {{backgroundColor:settings.palletteOpen?'blue':'inherit',color:settings.palletteOpen?'white':'inherit'}} onClick = {()=> setSettings({...settingsRef.current,palletteOpen:!settingsRef.current.palletteOpen})}>{" color "}</div>
          </div>
          {settings.palletteOpen &&
            <div style = {{display:'flex',padding:'10px',marginTop:'10px',borderRadius:'30px',backgroundColor:'black',width:'fit-content'}}>
              <ColorPicker label = "background" callback = {(val)=>{setSettings({...settingsRef.current,backgroundColor:val})}} defaultValue = {settings.backgroundColor}></ColorPicker>
              <ColorPicker label = "foreground" callback = {(val)=>{setSettings({...settingsRef.current,foregroundColor:val})}} defaultValue = {settings.foregroundColor}></ColorPicker>
              <ColorPicker label = "ghosting" callback = {(val)=>{setSettings({...settingsRef.current,overlayColor:val})}} defaultValue = {settings.overlayColor}></ColorPicker>
            </div>
          }
          {/* playback speed slider */}
          <div className='button_holder'>
            <input type="range" className = "control_slider" id="frame_speed_slider" name="ms" min="100" max="1000" step="100" onInput={(e) => {window.clearTimeout(timeoutIDRef.current);setSettings({...settingsRef.current,frameSpeed:parseInt(e.target.value)});if(settingsRef.current.playing){
              timeoutIDRef.current = window.setTimeout(playNextFrame,parseInt(e.target.value));
            }}} />
            <p>{settings.frameSpeed+'ms'}</p>
          </div>

          {/* drop zone */}
          <label id="drop-zone">
            Drop images here, or click to upload.
            <input type="file" id="file-input" multiple accept="image/*" style = {{display:'none'}} onInput={(e) => loadImage(e.target.files)} />
          </label>

          {/* settings */}
          <div className = 'button_holder' style = {{width:'200px',padding:'0px 1em',alignItems:'center',flexDirection:'column'}}>
            <div className = "button" style = {{backgroundColor:settings.settingsBoxOpen?'blue':'inherit',color:settings.settingsBoxOpen?'white':'inherit'}} onClick = {()=> setSettings({...settingsRef.current,settingsBoxOpen:!settingsRef.current.settingsBoxOpen})}>{" settings "}</div>
          </div>
          {settings.settingsBoxOpen &&
          <div style = {{borderLeft:'1px solid black',width:'fit-content',padding:'10px'}}>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,overwriteWithBackground:!settingsRef.current.overwriteWithBackground});}}>{settings.overwriteWithBackground?(<>background overwrites foreground when moving: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"background overwrites foreground when moving: OFF"}</div>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,overlayGhosting:!settingsRef.current.overlayGhosting});}}>{settings.overlayGhosting?(<>ghosting: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON"}</span></>):"ghosting: OFF"}</div>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,overlayGrid:!settingsRef.current.overlayGrid});}}>{settings.overlayGrid?(<>grid: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"grid: OFF"}</div>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,resizeCanvasToImage:!settingsRef.current.resizeCanvasToImage});}}>{settings.resizeCanvasToImage?(<>resize to uploaded image: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"resize to uploaded image: OFF"}</div>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,useAlphaAsBackground:!settingsRef.current.useAlphaAsBackground});}}>{settings.useAlphaAsBackground?(<>use transparency to determine background: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"use transparency to determine background: OFF"}</div>
            <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,parseFilesToSpritesByName:!settingsRef.current.parseFilesToSpritesByName});}}>{settings.parseFilesToSpritesByName?(<>autogen sprites from filenames: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"autogen sprites from filenames: OFF"}</div>
          </div>
          }
        </div>

        {/* download links */}
        <div id = "download_link_container">
          <p style = {{padding:'none',marginBottom:'0px',fontFamily:'chopin',fontWeight:'normal',fontSize:'20px'}}>Name Prefix:</p>
          <textarea style = {{fieldSizing:'content',height:'1em',borderRadius:'6px',backgroundColor:'blue',color:'white',padding:'4px',resize:'none',alignContent:'center'}} onInput={(e) => 
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
        </div>
      </div>
    </div>
  )
}

export default App