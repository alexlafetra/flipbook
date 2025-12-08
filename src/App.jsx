import { useState , useEffect , useRef} from 'react'
import React from 'react'
import './main.css';
import JSZip from 'jszip'


function App() {

  const PixelFrame = (w,h,fill) => {
    const data = [];
    for(let i = 0; i<w*h; i++){
      if(fill.length && fill.length > i)
        data[i] = fill[i];
      else
        data[i] = fill;
    }
    return{
      width : w,
      height: h,
      data : data,
      getPixel : function(x,y){
        if(x>=this.width || x<0 || y>=this.height || y<0)
          return undefined;
        return this.data[x+this.width*y];
      },
      setPixel : function(x,y,val){
        if(x>=this.width || x<0 || y>=this.height || y<0)
          return;
        this.data[x+this.width*y] = val;
      },
      drawLine : function(x0,y0,x1,y1,val){
        const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
        if (steep) {
          [x0, y0] = [y0,x0];
          [x1, y1] = [y1,x1];
        }

        if (x0 > x1) {
          [x0, x1] = [x1,x0];
          [y0, y1] = [y1,y0];
        }

        let dx, dy;
        dx = x1 - x0;
        dy = Math.abs(y1 - y0);

        let err = Math.trunc(dx / 2);
        let ystep;

        if (y0 < y1) {
          ystep = 1;
        } else {
          ystep = -1;
        }
        let y = y0;
        for (let x = x0; x <= x1; x++) {
          if (steep) {
            this.setPixel(y,x,val);
          } else {
            this.setPixel(x,y,val);
          }
          err -= dy;
          if (err < 0) {
            y += ystep;
            err += dx;
          }
        }
      },
      // https://codeheir.com/blog/2022/08/21/comparing-flood-fill-algorithms-in-javascript/
      fill : function(x,y,fillColor){

        //seed-checking fn that checks bounds and color to see if a pixel should be a new seed
        const isValid = (xi,yi,color) => {
          return ((xi >= 0) && (xi < this.width) && (yi >= 0) && (yi < this.height) && (this.getPixel(xi,yi) === color));
        }

        const scan = (lx, rx, y, stack, colorToBeFilled) => {
            for (let i = lx; i <= rx; i++) {
              if (isValid(i, y, colorToBeFilled)) {
                stack.push({x: i, y: y, color: colorToBeFilled});
              }
            }
            return stack;
        }

        const colorToBeFilled = this.getPixel(x,y);

        if(!isValid(x,y,this.getPixel(x,y))){
          return;
        }

        if (colorToBeFilled === fillColor) return;

        let stack = [{x:x,y:y,color:colorToBeFilled}];

        while (stack.length > 0) {
            let seed = stack.pop();

            //left fill
            let lx = seed.x;
            while (isValid(lx, seed.y, seed.color)) {
              this.setPixel(lx,seed.y,fillColor);
              lx = lx -1;
            }

            //right fill
            let rx = seed.x + 1;
            while (isValid(rx, seed.y, seed.color)) {
              this.setPixel(rx,seed.y,fillColor);
              rx = rx + 1;
            }

            //scan up/down
            stack = scan(lx+1, rx-1, seed.y + 1, stack, seed.color);
            stack = scan(lx+1, rx-1, seed.y - 1, stack, seed.color)
        }
        return;
    },
    invert : function(){
      for(let i = 0; i<this.data.length; i++){
        this.data[i] = (this.data[i] == 1) ? 0 : 1;
      }
      return this;
    }
    }
  }
  const zip = useRef(new JSZip());
  const startClickCoords = useRef({x:0,y:0});
  const pixelSaveState = useRef(undefined);
  const [currentMouseCoords,setCurrentMouseCoords] = useState({x:0,y:0});
  const [sprite,setSprite] = useState(
    {
      frames : [PixelFrame(16,16,0)],
      width:16,
      height:16,
      currentFrame:0,
      fileName : 'new_sprite_'
    }
  );
  const [spritesheet,setSpritesheet] = useState({sprites:[sprite],currentSprite:0});
  const spritesheetRef = useRef(spritesheet);
  useEffect(() => {
    spritesheetRef.current = spritesheet;
  },[spritesheet]);
  useEffect(()=>{
    console.log(spritesheet.currentSprite);
    setSprite(spritesheet.sprites[spritesheet.currentSprite]);
  },[spritesheet.currentSprite]);

  const [userInputDimensions,setUserInputDimensions] = useState({
    width:sprite.width,
    height:sprite.height
  });
  const userInputDimensionsRef = useRef(userInputDimensions);
  useEffect(() => {
    userInputDimensionsRef.current = userInputDimensions;
  },[userInputDimensions]);

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

  const spriteRef = useRef(sprite);
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

  // Re-render the main canvas whenever the current frame changes
  useEffect(() => {
    spriteRef.current = sprite;
    settingsRef.current = settings;
    renderCurrentFrameToMainCanvas();
  }, [sprite,settings]);

  const mainCanvasRef = useRef(null);
  //use this to clear the playNextFrame() timeout
  const timeoutIDRef = useRef(null);

  function getClickCoords(e){
    const dims = e.target.getBoundingClientRect();
    const clickCoords = {
      x:e.pageX - dims.left,
      y:e.pageY - dims.top
    };
    //px per char
    const pixelDims = {
      width : dims.width / spriteRef.current.width,
      height : dims.height / spriteRef.current.height,
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
    switch(settingsRef.current.currentTool){
      case 'pixel':
        const newFrames = spriteRef.current.frames;
        newFrames[spriteRef.current.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
        setSprite({...spriteRef.current,frames:newFrames});
        break;
      case 'fill':{
        const newFrames = spriteRef.current.frames;
        newFrames[spriteRef.current.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
        setSprite({...spriteRef.current,frames:newFrames});
      }
        break;
      case 'line':
        //make a backup of the line
        // pixelSaveState.current = spriteRef.current.frames[spriteRef.current.currentFrame];
        pixelSaveState.current = PixelFrame(spriteRef.current.width,spriteRef.current.height,spriteRef.current.frames[spriteRef.current.currentFrame].data);
        setSettings({
          ...settingsRef.current,
          lineStarted : true
        });
        break;
    }
  }

  function handleMouseMove(e){
    const coords = getClickCoords(e);
    setCurrentMouseCoords(coords);
    //detect if the mouse button is held down (necessary for dragging)
    if(e.buttons){
      switch(settingsRef.current.currentTool){
        case 'pixel':
          const newFrames = spriteRef.current.frames;
          newFrames[spriteRef.current.currentFrame].setPixel(coords.x,coords.y,settingsRef.current.currentColor);
          setSprite({...spriteRef.current,frames:newFrames});
          break;
        case 'line':
          //if you've already started a line, draw it
          if(settingsRef.current.lineStarted){
            const newFrames = spriteRef.current.frames;
            newFrames[spriteRef.current.currentFrame] = PixelFrame(pixelSaveState.current.width,pixelSaveState.current.height,pixelSaveState.current.data);
            newFrames[spriteRef.current.currentFrame].drawLine(startClickCoords.current.x,startClickCoords.current.y,coords.x,coords.y,settingsRef.current.currentColor);
            setSprite({
              ...spriteRef.current,
              frames:newFrames
            });
          }
          break;
        case 'fill':{
          const newFrames = spriteRef.current.frames;
          newFrames[spriteRef.current.currentFrame].fill(coords.x,coords.y,settingsRef.current.currentColor);
          setSprite({...spriteRef.current,frames:newFrames});
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
    const newFrame = PixelFrame(spriteRef.current.width, spriteRef.current.height, 0);
    
    //copy over data, but shifted
    for(let x = 0; x<spriteRef.current.frames[spriteRef.current.currentFrame].width; x++){
      for(let y = 0; y<spriteRef.current.frames[spriteRef.current.currentFrame].height; y++){
          newFrame.setPixel(x+heading.x,y+heading.y,spriteRef.current.frames[spriteRef.current.currentFrame].getPixel(x,y));
      }
    }

    const newFrames = [...spriteRef.current.frames];
    newFrames[spriteRef.current.currentFrame] = newFrame;
    setSprite({
      ...spriteRef.current,
      frames : newFrames,
    });
  }

  function renderCurrentFrameToMainCanvas(){
    const canvas = mainCanvasRef.current;
    if(!canvas)
      return;

    const currentSprite = spriteRef.current;

    //figure out the last frame, to draw ghosting
    let previousFrame = undefined;
    if(spriteRef.current.currentFrame > 0)
      previousFrame = spriteRef.current.currentFrame - 1;
    else if(currentSprite.frames.length > 1)
      previousFrame = currentSprite.frames.length-1;

    //set canvas dims (these aren't the visual size of the canvas)
    canvas.width = spriteRef.current.width;
    canvas.height = spriteRef.current.height;

    //get drawing context
    const context = canvas.getContext("2d");
    //draw over each pixel
    for(let x = 0; x<currentSprite.width; x++){
      for(let y = 0; y<currentSprite.height; y++){
        let bgColor = "#000000";
        //if there's a previous frame, ghost it
        if(previousFrame !== undefined  && settingsRef.current.overlayGhosting){
          bgColor = currentSprite.frames[previousFrame].getPixel(x,y)?"#555555ff":bgColor;
        }
        context.fillStyle = currentSprite.frames[spriteRef.current.currentFrame].getPixel(x,y)?"#FFFFFF":bgColor;
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
    setSprite({...spriteRef.current,currentFrame:((spriteRef.current.currentFrame + 1) % spriteRef.current.frames.length)});
    timeoutIDRef.current = window.setTimeout(playNextFrame,settingsRef.current.frameSpeed);
  }

  function clearFrame(){
    const newFrame = PixelFrame(spriteRef.current.width, spriteRef.current.height, 0);
    const newFrames = [...spriteRef.current.frames];
    newFrames[spriteRef.current.currentFrame] = newFrame;
    setSprite({
      ...spriteRef.current,
      frames : newFrames,
    });
  }

  function addNewFrame(){
    const newFrame = PixelFrame(spriteRef.current.width, spriteRef.current.height, 0);
    const newFrames = [...spriteRef.current.frames];
    newFrames.push(newFrame);
    setSprite({
      ...spriteRef.current,
      frames : newFrames,
      currentFrame:newFrames.length-1
    });
  }

  function duplicateFrame(frame){
    const targetFrame = PixelFrame(spriteRef.current.width, spriteRef.current.height, 0);
    
    //copy over all the data (can't copy object ref)
    for(let i = 0; i<targetFrame.data.length; i++){
      targetFrame.data[i] = spriteRef.current.frames[frame].data[i];
    }
    const newFrames = [...spriteRef.current.frames];
    newFrames.splice(frame,0,targetFrame);
    setSprite({
      ...spriteRef.current,
      frames : newFrames,
    });
  }

  function deleteFrame(){
    if(spriteRef.current.frames.length>1){
      const newFrames = spriteRef.current.frames.toSpliced(spriteRef.current.currentFrame,1);
      setSprite({
        ...spriteRef.current,
        frames : newFrames,
        currentFrame:(spriteRef.current.currentFrame > (newFrames.length - 1))?(newFrames.length-1):spriteRef.current.currentFrame
      });
    }
  }

  function reverseFrames(){
    setSprite({
      ...spriteRef.current,
      frames:spriteRef.current.frames.reverse()
    });
  }

  function handleKeyDown(e){
    if((e.target === document.body)){
      switch(e.key){
        case 'ArrowLeft':
          setSprite({...spriteRef.current,currentFrame:spriteRef.current.currentFrame?((spriteRef.current.currentFrame - 1) % spriteRef.current.frames.length):(spriteRef.current.frames.length-1)});
          break;
        case 'ArrowRight':
          setSprite({...spriteRef.current,currentFrame:((spriteRef.current.currentFrame + 1) % spriteRef.current.frames.length)});
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
    for(let frame = 0; frame<spriteRef.current.frames.length; frame++){
      renderFrame(mainCanvasRef.current.getContext('2d'),spriteRef.current,frame,{x:0,y:0});
      mainCanvasRef.current.toBlob((blob) => {
        const filename = spriteRef.current.fileName+(frame+1)+'.bmp';
        zip.current.file(filename,blob);
        if(frame === spriteRef.current.frames.length-1)
          downloadZip();
      });
    }
  }

  function downloadSingleFrameAsBMP(frame){
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = spriteRef.current.width;
    tempCanvas.height = spriteRef.current.height;
    renderFrame(tempCanvas.getContext('2d'),spriteRef.current,frame,{x:0,y:0});
    tempCanvas.toBlob((blob) => {
      const a = document.createElement('a');
      const filename = spriteRef.current.fileName+(frame+1)+'.bmp';
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
    for(let frame = 0; frame<sprite.frames.length; frame++){
      children.push(<p key = {frame} style = {{color:'blue',textDecoration:'underline',cursor:'pointer'}} onClick = {(e) => downloadSingleFrameAsBMP(frame)}>{sprite.fileName+(frame+1)+'.bmp'}</p>);
    }
    return(
      <div style = {{display:'flex',flexDirection:'column'}}>
        {children}
      </div>
    )
  }

  function BitmapText(){

  }

  function GridDivs(){
    const children = [];
    const parentStyle = {
      width:sprite.width*settingsRef.current.canvasScale + 'px',
      height:sprite.height*settingsRef.current.canvasScale + 'px',
      display:'grid',
      position:'fixed',
      gridTemplateColumns:'repeat('+sprite.width+',1fr)',
      gridTemplateRows:'repeat('+sprite.height+',1fr)'
    }
    const borderStyle = '1px dashed #535889ff';
    for(let i = 0; i<sprite.width*sprite.height; i++){
      const childStyle = {
        width:((settingsRef.current.canvasScale-1) - 1/sprite.width)+'px',
        height:((settingsRef.current.canvasScale-1) - 1/sprite.height)+'px',
        border:'1px dashed transparent',
        borderLeft:'none',
        borderTop:'none'
      };
      childStyle.border = borderStyle;
      if((i%sprite.width) == 0){
        childStyle.borderLeft = borderStyle;
      }
      if(i<sprite.width){
        childStyle.borderTop = borderStyle;
      }
      children.push(<div key = {i} className = "grid_div" style = {childStyle}></div>);
    }
    return(<div style = {parentStyle}>{children}</div>);
  }

  const gridDivs = useRef(GridDivs());
  useEffect(() => {
    gridDivs.current = GridDivs();
  },[settingsRef.current.canvasScale,sprite.width,sprite.height]);

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
          setFrameFromCanvas(mainCanvasRef.current,spriteRef.current.currentFrame);
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
    const pixelData = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    const newPixelFrame = PixelFrame(spriteRef.current.width,spriteRef.current.height,0);
    for(let px = 0; px<pixelData.data.length/4; px++){
      newPixelFrame.setPixel(px%canvas.width,Math.trunc(px/canvas.height),pixelData.data[px*4]?1:0);
    }
    const newFrames = spriteRef.current.frames;
    newFrames[frame] = newPixelFrame;
    setSprite({
      ...spriteRef.current,
      frames: newFrames
    });
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
    return Math.ceil(sprite.width*sprite.height/8) * sprite.frames.length;
  }
  function resizeCanvasToNewDimensions(){
    const newFrames = [];
    for(let frame of spriteRef.current.frames){
      const targetFrame = PixelFrame(userInputDimensionsRef.current.width, userInputDimensionsRef.current.height, 0);
      //copy over all the data (can't copy object ref)
      for(let x = 0; x<targetFrame.width; x++){
        for(let y = 0; y<targetFrame.height; y++){
          targetFrame.setPixel(x,y,frame.getPixel(x,y));
        }
      }
      newFrames.push(targetFrame);
    }
    setSprite({
      ...spriteRef.current,
      width:userInputDimensionsRef.current.width,
      height:userInputDimensionsRef.current.height,
      frames:newFrames
    });
  }
  function addNewSprite(){
    const newSprite = {
      frames : [PixelFrame(16,16,0)],
      width:16,
      height:16,
      currentFrame:0,
      fileName : 'new_sprite_'
    };
    const newSprites = [...spritesheetRef.current.sprites, newSprite];
    setSpritesheet({
      sprites:newSprites,
      currentSprite:newSprites.length-1
    });
  }

  function deleteSprite(index){
    if(spritesheetRef.current.sprites.length<=1)
      return;
    const newSpritesheet = [...spritesheetRef.current.sprites];
    newSpritesheet.splice(index,1);
    setSpritesheet({
      currentSprite:Math.min(spritesheetRef.current.currentSprite,newSpritesheet),    
      sprites:newSpritesheet
    });
  }

  function SpritesheetTabs(){
    const tabs = [];
    spritesheet.sprites.map((tab,index) => {
      const tabStyle = {
        borderRadius:'10px 10px 0px 0px',
        border: '1px solid black',
        padding:'4px',
        display:'flex',
        alignItems:'center',
      };
      if(index === spritesheet.currentSprite){
        tabStyle.borderBottom = 'none';
      }
      else{
        tabStyle.borderLeft = 'none';
        tabStyle.borderTop = 'none';
        tabStyle.borderRight = 'none';
      }
      tabs.push(<div className = "spritesheet_tab" style = {tabStyle} key = {index} 
        onClick = {()=>{
        const newSpritesheet = spritesheetRef.current.sprites;
        newSpritesheet[spritesheetRef.current.currentSprite] = spriteRef.current;
        setSpritesheet(prev => ({
          ...prev,
          currentSprite: index,
          sprites: [...newSpritesheet], // shallow clone only the container
        }));
      }}>{tab.fileName}<div className = "delete_button" onClick = {()=>{deleteSprite(index)}}>{" x "}</div></div>);
    });
    tabs.push(<div key = {spritesheet.sprites.length} className = "button" onClick = {addNewSprite}>{" + "}</div>);
    return(
    <>
      <div className = "spritesheet_tabs">
        {tabs}
      </div>
    </>
    );
  }

  return (
    <div className = "center_container">
      <div className = "app_container">
        <img id = "title" src = 'spritemaker/tamo_logo.png'/>
        <div id = "grid_overlay" style = {{width:sprite.width*settings.canvasScale+'px',display:'block',position:'relative',gridArea:'canvas',pointerEvents:'none'}}>
          {settings.overlayGrid && gridDivs.current}
          <canvas id = "pixel_canvas" style = {{cursor:canvasCursor(),imageRendering:'pixelated',width:sprite.width*settings.canvasScale +'px',height:sprite.height*settings.canvasScale +'px'}}ref = {mainCanvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}></canvas>
        </div>
        <SpritesheetTabs></SpritesheetTabs>
        <div className = "ui_container">
          <div id = "preview_canvases" style = {{display:'flex',alignItems:'center',width:'300px',flexWrap:'wrap',maxHeight:'150px',overflowY:'scroll'}}>
            {sprite.frames.map((frame,index) => {
              return <canvas key = {index} className = "preview_canvas" style = {{borderColor:(index == sprite.currentFrame)?'red':'inherit',cursor:'pointer',imageRendering:'pixelated',width:sprite.width*2+'px',height:sprite.height*2+'px'}} 
              ref = 
              {(el)=>{
                if(el){
                  const ctx = el.getContext('2d');
                  el.width = sprite.width;
                  el.height = sprite.height;
                  renderFrame(ctx,sprite,index,{x:0,y:0});
                }
              }}
              onClick = {(e)=>{
                setSprite({...spriteRef.current,currentFrame:index})
              }
              }></canvas>;
            })}
          </div>
          <div>frame -- {sprite.currentFrame+1} / {sprite.frames.length}</div>
          {/* frame editing */}
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" onClick = {addNewFrame}>{" + "}</div>
            <div className = "button" onClick = {deleteFrame}>{" - "}</div>
            <div className = "button" onClick = {()=>{duplicateFrame(spriteRef.current.currentFrame)}}>{" dupe "}</div>
            <div className = "button" onClick = {reverseFrames}>{"reverse"}</div>
            <div className = "button" onClick = {settings.playing?()=>{
              stop();
            }:()=>{
              play();
            }}>{settings.playing?"stop":"play"}</div>
          </div>
          <div style = {{display:'flex',alignItems:'center'}}>
            <input inputMode = "numeric" type="number" style = {{border:'1px solid',borderRadius:'10px',padding:'4px',margin:'2px',backgroundColor:(userInputDimensions.width != sprite.width)?'blue':'inherit',color:(userInputDimensions.width != sprite.width)?'white':'inherit'}} className = "dimension_input" id="width_input" name="width" min="1" max="32" onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,width:parseInt(e.target.value)})}}defaultValue={sprite.width}/>
            <p style = {{fontStyle:'italic',fontFamily:'times'}}>x</p>
            <input inputMode = "numeric" type="number" style = {{border:'1px solid',borderRadius:'10px',padding:'4px',margin:'2px',backgroundColor:(userInputDimensions.height != sprite.height)?'blue':'inherit',color:(userInputDimensions.height != sprite.height)?'white':'inherit'}} className = "dimension_input" id="height_input" name="height" min="1" max="16" onInput = {(e) =>{setUserInputDimensions({...userInputDimensionsRef.current,height:parseInt(e.target.value)})}} defaultValue={sprite.height}/>
            {(userInputDimensions.height != sprite.height || userInputDimensions.width != sprite.width) &&
              <div className = "button" onClick = {resizeCanvasToNewDimensions}>resize</div>
            }
            <input type="range" style = {{width:'100px'}}className = "control_slider" id="canvas_scale_slider" name="ms" min="1" max="32" step="1" onInput={(e) => setSettings({...settingsRef.current,canvasScale:parseFloat(e.target.value)})} />
            <p>{settings.canvasScale+'x'}</p>
          </div>
          {/* pixel manipulation tools */}
          <div>tools -- {settings.currentTool} {'['+currentMouseCoords.x+','+currentMouseCoords.y+']'}</div>
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'pixel'?'blue':'inherit',color:settings.currentTool == 'pixel'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'pixel'})}}>{" pixel "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'line'?'blue':'inherit',color:settings.currentTool == 'line'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'line'})}}>{" line "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'fill'?'blue':'inherit',color:settings.currentTool == 'fill'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'fill'})}}>{" fill "}</div>
            <div className = "button" style = {{backgroundColor:settings.currentTool == 'move'?'blue':'inherit',color:settings.currentTool == 'move'?'white':'inherit'}} onClick = {() => {setSettings({...settingsRef.current,currentTool:'move'})}}>{" move "}</div>
          </div>
          <div id = "button_holder" style = {{display:'flex'}}>
            <div className = "button" style = {{backgroundColor:settings.currentColor == 1?'inherit':'black',color:settings.currentColor == 1?'inherit':'white'}} onClick = {() => {setSettings({...settingsRef.current,currentColor:settingsRef.current.currentColor?0:1})}}>{"  "}</div>
            <div className = "button" onClick = {clearFrame}>{"clear"}</div>
            <div className = "button" onClick = {() => {const newFrames = [...spriteRef.current.frames]; newFrames[spriteRef.current.currentFrame] = spriteRef.current.frames[spriteRef.current.currentFrame].invert(); setSprite({...spriteRef.current,frames:newFrames});}}>{" invert "}</div>
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
          <textarea style = {{backgroundColor:'blue',color:'white',padding:'none',width:'100px',height:'25px',resize:'none',alignContent:'center'}} onInput={(e) => {e.preventDefault();setSprite({...spriteRef.current,fileName:e.target.value})}} defaultValue = {sprite.fileName}/>
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