import { useState , useEffect , useRef, useLayoutEffect} from 'react'
import './main.css';
import JSZip from 'jszip'
import { v4 as uuid } from "uuid";
import { Sprite } from './Sprite';
import { PixelFrame } from './PixelFrame';

// helpful chatGPT react tip:
/*
Important rule:

🟥 DO NOT mutate the structure of sprites, frames[], or spritesheet objects in-place.

🟩 DO mutate the PixelFrame.data buffer in-place.
*/
//Basically, you're only using react rerenders to redraw
//the UI. NOT the pixel data, which you redraw manually!

function App() {
  const zip = useRef(new JSZip());
  const startClickCoords = useRef({x:0,y:0});
  const pixelSaveState = useRef(undefined);
  const [currentMouseCoords,setCurrentMouseCoords] = useState({x:0,y:0});

  //update the highlight on the divs whenever the mouse coords are updated
  useEffect(()=>{
    const divs = document.getElementsByClassName("grid_div");
    for(let div of divs){
      div.style.backgroundColor = 'transparent';
    }
    if(currentMouseCoords === null)
      return;
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    const index = currentMouseCoords.y * sprite.width + currentMouseCoords.x;
    const targetDiv = document.getElementById("grid_div_"+index);
    if(targetDiv)
      targetDiv.style.backgroundColor = '#04ff008f';
  },[currentMouseCoords]);

  const [spritesheet,setSpritesheet] = useState({
    sprites:[Sprite()],
    currentSprite:0,
    getSprite:function(){
      return this.sprites[this.currentSprite];
    }
  });
  const [currentSprite,setCurrentSprite] = useState(0);
  const [sprites,setSprites] = useState([Sprite()]);
  
  const spritesheetRef = useRef(spritesheet);
  useEffect(() => {
    spritesheetRef.current = spritesheet;
    // setSpritesheetTabs(createSpritesheetTabs(spritesheet));
    renderCurrentFrameToMainCanvas();
  },[spritesheet]);

  const [userInputDimensions,setUserInputDimensions] = useState({
    width:spritesheet.sprites[spritesheet.currentSprite].width,
    height:spritesheet.sprites[spritesheet.currentSprite].height
  });
  const userInputDimensionsRef = useRef(userInputDimensions);
  useEffect(() => {
    userInputDimensionsRef.current = userInputDimensions;
  },[userInputDimensions]);

  const [settings,setSettings] = useState({
    overlayGhosting: true,
    overlayGrid: true,
    frameSpeed : 1000,//speed in ms
    currentTool: 'pixel',
    currentColor:1,//1 for white, 0 for black
    canvasScale:16,
    playing:false,
    lineStarted:false
  })
  const settingsRef = useRef(settings);
  const backupSettingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    renderCurrentFrameToMainCanvas();
  }, [settings]);

  const mainCanvasRef = useRef(null);
  //use this to clear the playNextFrame() timeout
  const timeoutIDRef = useRef(null);


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
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    const dims = e.target.getBoundingClientRect();
    const clickCoords = {
      x:e.pageX - dims.left,
      y:e.pageY - dims.top
    };
    //px per char
    const pixelDims = {
      width : dims.width / sprite.width,
      height : dims.height / sprite.height,
    };
    return {x: Math.trunc(clickCoords.x/pixelDims.width),y:Math.trunc(clickCoords.y/pixelDims.height)};
  }
  function handleMouseUp(e){
    switch(settingsRef.current.currentTool){
      case 'line':
        setSettings({
          ...settingsRef.current,
          lineStarted : false
        });
        break;
    }
  }
  function handleMouseDown(e){
    const coords = getClickCoords(e);
    startClickCoords.current = coords;
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
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
        break;
    }
  }
  function handleMouseLeave(e){
    setCurrentMouseCoords(null);
  }
  function handleMouseMove(e){
    const coords = getClickCoords(e);
    setCurrentMouseCoords(coords);
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    //detect if the mouse button is held down (necessary for dragging)
    if(e.buttons){
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
          const movement = {
            x: coords.x - startClickCoords.current.x,
            y: coords.y - startClickCoords.current.y
          };
          if(movement.x || movement.y){
            startClickCoords.current = coords;
            shiftPixels(movement);
          }
          break;
      }
    }
  }

  function shiftPixels(heading){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    const newFrame = PixelFrame(sprite.width, sprite.height, 0);
    
    //copy over data, but shifted
    for(let x = 0; x<sprite.frames[sprite.currentFrame].width; x++){
      for(let y = 0; y<sprite.frames[sprite.currentFrame].height; y++){
        newFrame.setPixel(x+heading.x,y+heading.y,sprite.frames[sprite.currentFrame].getPixel(x,y));
      }
    }
    sprite.frames[sprite.currentFrame] = newFrame;
    renderCurrentFrameToMainCanvas();
  }

  function renderCurrentFrameToMainCanvas(){
    const canvas = mainCanvasRef.current;
    if(!canvas)
      return;

    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];

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
        let bgColor = "#000000";
        //if there's a previous frame, ghost it
        if(previousFrame !== undefined  && settingsRef.current.overlayGhosting){
          bgColor = sprite.frames[previousFrame].getPixel(x,y)?"#555555ff":bgColor;
        }
        context.fillStyle = sprite.frames[sprite.currentFrame].getPixel(x,y)?"#FFFFFF":bgColor;
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
        context.fillStyle = sprite.frames[frame].getPixel(x,y)?"#FFFFFF":"#000000";
        context.fillRect(x+offset.x,y+offset.y,1,1);
      }
    }
  }

  function playNextFrame(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    sprite.nextFrame();
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
    timeoutIDRef.current = window.setTimeout(playNextFrame,settingsRef.current.frameSpeed);
  }

  function clearFrame(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    sprite.frames[sprite.currentFrame] = PixelFrame(sprite.width, sprite.height, 0);
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
  }

  function invertFrame(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    sprite.frames[sprite.currentFrame].invert();
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
  }

  function addNewFrame(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    sprite.frames = [...sprite.frames,PixelFrame(sprite.width, sprite.height, 0)];
    sprite.currentFrame = sprite.frames.length-1;
    //trigger rerender to remake previews
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
  }

  function duplicateFrame(frame){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
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
    setSpritesheet(prev => ({
      ...prev,
      sprites : [...prev.sprites]
    }));
  }

  function deleteFrame(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    if(sprite.frames.length>1){
      const newFrames = sprite.frames.toSpliced(sprite.currentFrame,1);
      sprite.frames = newFrames;
      sprite.currentFrame = Math.min(sprite.currentFrame,sprite.frames.length-1);
      //trigger rerender to recreate previews
      setSpritesheet(prev => ({
        ...prev,
        sprites : [...prev.sprites]
      }));
      }
  }

  function reverseFrames(){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    sprite.frames.reverse();
    setSpritesheet(prev => ({
      ...prev,
      sprites : [...prev.sprites]
    }));
  }

  function handleKeyDown(e){
    if((e.target === document.body)){
      const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
      switch(e.key){
        case 'ArrowLeft':
          sprite.nextFrame();
          setSpritesheet(prev => ({
            ...prev,
            sprites : [...prev.sprites]
          }));
          break;
        case 'ArrowRight':
          sprite.previousFrame();
          setSpritesheet(prev => ({
            ...prev,
            sprites : [...prev.sprites]
          }));
          break;
        case ' ':
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
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    for(let frame = 0; frame<sprite.frames.length; frame++){
      renderFrame(mainCanvasRef.current.getContext('2d'),sprite,frame,{x:0,y:0});
      mainCanvasRef.current.toBlob((blob) => {
        const filename = sprite.fileName+'_'+(frame+1)+'.bmp';
        zip.current.file(filename,blob);
        if(frame === sprite.frames.length-1)
          downloadZip();
      });
    }
  }

  function downloadSingleFrameAsBMP(frame){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
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
  function downloadZip(){
    zip.current.generateAsync({type : 'blob' }).then((content) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = 'sprite.zip';
      a.click();
    });
  }

  // outputs a link for each frame
  function FrameDownloadLinks(){
    const children = [];
    const sprite = spritesheet.sprites[spritesheet.currentSprite];
    for(let frame = 0; frame<sprite.frames.length; frame++){
      children.push(<p key = {frame} style = {{color:'blue',textDecoration:'underline',cursor:'pointer'}} onClick = {(e) => downloadSingleFrameAsBMP(frame)}>{sprite.fileName+'_'+(frame+1)+'.bmp'}</p>);
    }
    return(
      <div style = {{display:'flex',flexDirection:'column'}}>
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
      position:'fixed',
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
  // const [spritesheetTabs,setSpritesheetTabs] = useState(()=>createSpritesheetTabs(spritesheet));
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
  function loadImage(files){
    //just one file, draw it to the current canvas
    if(files.length == 1){
      const reader = new FileReader();
      //callback once the file is read
      reader.onload = function () {

        //make an image, draw it to canvas
        const img = new Image();
        img.onload = function(){
          const ctx = mainCanvasRef.current.getContext('2d');
          ctx.drawImage(img, 0, 0);
          setFrameFromCanvas(mainCanvasRef.current,spritesheetRef.current.sprites[spritesheetRef.current.currentSprite].currentFrame);
        }
        img.src = reader.result;
      }
      reader.readAsDataURL(files[0]);
      return;
    }
    //if it's many files, draw each one to a new canvas
    for(let file = 0; file<files.length; file++){
      const reader = new FileReader();
      //callback once the file is read
      reader.onload = function () {

        //make an image, draw it to canvas
        const img = new Image();
        img.onload = function(){
          const ctx = mainCanvasRef.current.getContext('2d');
          ctx.drawImage(img, 0, 0);
          setFrameFromCanvas(mainCanvasRef.current,file);
        }
        img.src = reader.result;
      }
      reader.readAsDataURL(files[file]);
    }
  }

  function setFrameFromCanvas(canvas,frame){
    const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
    const pixelData = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    const newPixelFrame = PixelFrame(sprite.width,sprite.height,0);
    for(let px = 0; px<pixelData.data.length/4; px++){
      newPixelFrame.setPixel(px%canvas.width,Math.trunc(px/canvas.height),pixelData.data[px*4]?1:0);
    }
    sprite.frames[frame] = newPixelFrame;
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
  }
  function canvasCursor(){
    switch(settings.currentTool){
      case 'pixel':
      case 'line':
        return 'pointer';
      case 'move':
        return 'move';
    }
  }


  function getTotalImageDataSize(){
    const sprite = spritesheet.sprites[spritesheet.currentSprite];
    return Math.ceil(sprite.width*sprite.height/8) * sprite.frames.length;
  }
  function resizeCanvasToNewDimensions(){
    const sprite = spritesheet.sprites[spritesheet.currentSprite];
    for(let frame of sprite.frames){
      const targetFrame = PixelFrame(userInputDimensionsRef.current.width, userInputDimensionsRef.current.height, 0);
      //copy over all the data (can't copy object ref)
      for(let x = 0; x<targetFrame.width; x++){
        for(let y = 0; y<targetFrame.height; y++){
          targetFrame.setPixel(x,y,frame.getPixel(x,y));
        }
      }
      frame = targetFrame;
    }
    sprite.width = userInputDimensionsRef.current.width;
    sprite.height = userInputDimensionsRef.current.height;
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites]
    }));
    setGridDivs(createGridDivs(sprite.width,sprite.height,settingsRef.current.canvasScale));
  }

  function addNewSprite(){
    const newSprite = Sprite();
    setSpritesheet(prev => ({
      ...prev,
      sprites:[...prev.sprites,newSprite],
      currentSprite: prev.sprites.length
    }));
  }

  function deleteSprite(index){
    setSpritesheet(prev => {
      if (prev.sprites.length <= 1)
        return prev;

      //remove target sprite
      const newSprites = prev.sprites.filter((_,i) => i != index);
      //new current sprite
      const newCurrent = Math.min(prev.currentSprite, newSprites.length - 1);
      const updated = {
        ...prev,
        sprites: newSprites,
        currentSprite: newCurrent
      };
      spritesheetRef.current = updated;
      return updated;
    });
  }

  function createSpritesheetTabs(sheet){
    const currentTab = sheet.currentSprite;
    const sprites = sheet.sprites;
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
        tabStyle.borderBottom = 'none';
        tabStyle.borderLeft = '1px solid black';
        tabStyle.borderRight = '1px solid black';
        tabStyle.borderTop = '1px solid black';
      }
      else{
        tabStyle.borderBottom = '1px solid black';
        tabStyle.borderLeft = 'none';
        tabStyle.borderTop = 'none';
        tabStyle.borderRight = 'none';
      }
      tabs.push(<div className = "spritesheet_tab" style = {tabStyle} key = {tab.id} 
        onClick = {()=>{
          setSpritesheet(prev => ({
            ...prev,
            currentSprite: index,
          }));
      }}>
        <textarea key={tab.id+"_textarea"} style = {{color:'black',border:'none',borderRadius:'10px',padding:'none',fieldSizing:'content',height:'1em',resize:'none',alignContent:'center'}} 
        onChange={(e) => {
              const sprite = tab;
              sprite.fileName = e.target.value;
              setSpritesheet(prev => ({
                ...prev,
                sprites:[...prev.sprites]
              }));
            }} value = {sprites[index].fileName}/>
        {sprites.length > 1 &&
          <div className = "delete_button" onClick = {()=>{deleteSprite(index)}}>{" x "}</div>
        }
        </div>);
    });
    tabs.push(<div key = {tabs.length} className = "button" onClick = {addNewSprite}>{" + "}</div>);
    return(
      <div className = "spritesheet_tabs">
        {tabs}
      </div>
    );
  }
  return (
    <div className = "center_container">
      <div className = "app_container">
        <img id = "title" src = 'spritemaker/tamo_logo.png'/>
        <div id = "grid_overlay" style = {{width:spritesheet.sprites[spritesheet.currentSprite].width*settings.canvasScale+'px',display:'block',position:'relative',gridArea:'canvas',pointerEvents:'none'}}>
          {settings.overlayGrid && gridDivs}
          <canvas id = "pixel_canvas" style = {{cursor:canvasCursor(),imageRendering:'pixelated',width:spritesheet.sprites[spritesheet.currentSprite].width*settings.canvasScale +'px',height:spritesheet.sprites[spritesheet.currentSprite].height*settings.canvasScale +'px'}} ref = {mainCanvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave = {handleMouseLeave}></canvas>
        </div>
        {/* {spritesheetTabs} */}
        {createSpritesheetTabs(spritesheet)}
        <div className = "ui_container">
          <div id = "preview_canvases" style = {{display:'flex',alignItems:'center',width:'300px',flexWrap:'wrap',maxHeight:'150px',overflowY:'scroll'}}>
            {spritesheet.sprites[spritesheet.currentSprite].frames.map((frame,index) => {
              return <canvas key = {index} className = "preview_canvas" style = {{borderColor:(index == spritesheet.sprites[spritesheet.currentSprite].currentFrame)?'red':'inherit',cursor:'pointer',imageRendering:'pixelated',width:spritesheet.sprites[spritesheet.currentSprite].width*2+'px',height:spritesheet.sprites[spritesheet.currentSprite].height*2+'px'}} 
              ref = 
              {(el)=>{
                if(el){
                  const ctx = el.getContext('2d');
                  el.width = spritesheet.sprites[spritesheet.currentSprite].width;
                  el.height = spritesheet.sprites[spritesheet.currentSprite].height;
                  renderFrame(ctx,spritesheet.sprites[spritesheet.currentSprite],index,{x:0,y:0});
                }
              }}
              onClick = {(e)=>{
                const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
                sprite.currentFrame = index;
                // force React to rerender
                setSpritesheet(prev => ({
                  ...prev,
                  sprites: [...prev.sprites]
                }));
              }
              }></canvas>;
            })}
          </div>
          <div>frame -- {spritesheet.sprites[spritesheet.currentSprite].currentFrame+1} / {spritesheet.sprites[spritesheet.currentSprite].frames.length}</div>
          {/* frame editing */}
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" onClick = {addNewFrame}>{" + "}</div>
            <div className = "button" onClick = {deleteFrame}>{" - "}</div>
            <div className = "button" onClick = {()=>{duplicateFrame(spritesheetRef.current.sprites[spritesheetRef.current.currentSprite].currentFrame)}}>{" dupe "}</div>
            <div className = "button" onClick = {reverseFrames}>{"reverse"}</div>
            <div className = "button" onClick = {settings.playing?()=>{
              stop();
            }:()=>{
              play();
            }}>{settings.playing?"stop":"play"}</div>
          </div>
          <div style = {{display:'flex',alignItems:'center'}}>
            <input inputMode = "numeric" type="number" style = {{border:'1px solid',borderRadius:'10px',padding:'4px',margin:'2px',backgroundColor:(userInputDimensions.width != spritesheet.sprites[spritesheet.currentSprite].width)?'blue':'inherit',color:(userInputDimensions.width != spritesheet.sprites[spritesheet.currentSprite].width)?'white':'inherit'}} className = "dimension_input" id="width_input" name="width" min="1" max="32" onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,width:parseInt(e.target.value)})}} defaultValue={spritesheet.sprites[spritesheet.currentSprite].width}/>
            <p style = {{fontStyle:'italic',fontFamily:'times'}}>x</p>
            <input inputMode = "numeric" type="number" style = {{border:'1px solid',borderRadius:'10px',padding:'4px',margin:'2px',backgroundColor:(userInputDimensions.height != spritesheet.sprites[spritesheet.currentSprite].height)?'blue':'inherit',color:(userInputDimensions.height != spritesheet.sprites[spritesheet.currentSprite].height)?'white':'inherit'}} className = "dimension_input" id="height_input" name="height" min="1" max="16" onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,height:parseInt(e.target.value)})}} defaultValue={spritesheet.sprites[spritesheet.currentSprite].height}/>
            {(userInputDimensions.height != spritesheet.sprites[spritesheet.currentSprite].height || userInputDimensions.width != spritesheet.sprites[spritesheet.currentSprite].width) &&
              <div className = "button" onClick = {resizeCanvasToNewDimensions}>resize</div>
            }
            <input type="range" style = {{width:'100px'}}className = "control_slider" id="canvas_scale_slider" name="ms" min="1" max="32" step="1" onInput={(e) => {
                const newScale = parseFloat(e.target.value);
                setSettings({...settingsRef.current,canvasScale:newScale});
                const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
                setGridDivs(createGridDivs(sprite.width,sprite.height,newScale));
              }} />
            <p>{settings.canvasScale+'x'}</p>
          </div>
          {/* pixel manipulation tools */}
          <div>tools -- {settings.currentTool} {currentMouseCoords &&'['+currentMouseCoords.x+','+currentMouseCoords.y+']'}</div>
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'pixel'?'blue':'inherit',color:settings.currentTool == 'pixel'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'pixel'})}}>{" pixel "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'line'?'blue':'inherit',color:settings.currentTool == 'line'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'line'})}}>{" line "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'fill'?'blue':'inherit',color:settings.currentTool == 'fill'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'fill'})}}>{" fill "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'move'?'blue':'inherit',color:settings.currentTool == 'move'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'move'})}}>{" move "}</div>
          </div>
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" style = {{backgroundColor:settings.currentColor == 1?'inherit':'black',color:settings.currentColor == 1?'inherit':'white'}} onClick = {() => {setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1})}}>{"  "}</div>
            <div className = "button" onClick = {clearFrame}>{"clear"}</div>
            <div className = "button" onClick = {invertFrame}>{" invert "}</div>
          </div>
          <div style = {{display:'flex'}}>
            <input type="range" className = "control_slider" id="frame_speed_slider" name="ms" min="100" max="1000" step="100" onInput={(e) => {window.clearTimeout(timeoutIDRef.current);setSettings({...settingsRef.current,frameSpeed:parseInt(e.target.value)});if(settingsRef.current.playing){
              timeoutIDRef.current = window.setTimeout(playNextFrame,parseInt(e.target.value));
            }}} />
            <p>{settings.frameSpeed+'ms'}</p>
          </div>
          <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,overlayGhosting:!settingsRef.current.overlayGhosting});}}>{settings.overlayGhosting?(<>ghosting: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON"}</span></>):"ghosting: OFF"}</div>
          <div style = {{border:'none'}} className = "button" onClick = {() => {setSettings({...settingsRef.current,overlayGrid:!settingsRef.current.overlayGrid});}}>{settings.overlayGrid?(<>grid: <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span></>):"grid: OFF"}</div>
          <label id="drop-zone">
            Drop images here, or click to upload.
            <input type="file" id="file-input" multiple accept="image/*" style = {{display:'none'}} onInput={(e) => loadImage(e.target.files)} />
          </label>          <p style = {{padding:'none',marginBottom:'0px',fontFamily:'chopin',fontWeight:'normal',fontSize:'20px'}}>Name Prefix:</p>
          <textarea style = {{fieldSizing:'content',height:'1em',borderRadius:'10px',backgroundColor:'blue',color:'white',padding:'4px',resize:'none',alignContent:'center'}} onInput={(e) => 
            {
              e.preventDefault();
              const sprite = spritesheetRef.current.sprites[spritesheetRef.current.currentSprite];
              sprite.fileName = e.target.value;
              setSpritesheet(prev => ({
                ...prev,
                sprites:[...prev.sprites]
              }));
            }} value = {spritesheet.sprites[spritesheet.currentSprite].fileName}/>
          <div id = "file_download_container" style = {{width:'fit-content',border:'1px solid',paddingLeft:'10px',paddingRight:'10px',maxHeight:'150px',overflowY:'scroll'}}>
            <FrameDownloadLinks></FrameDownloadLinks>
          </div>
          <div style = {{dispaly:'flex'}}>
            <div className = "button" onClick = {downloadAllFramesAsBMPs}>{"download zip"}</div>
            <p>{'('+getTotalImageDataSize()+' bytes of pixel data)'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App