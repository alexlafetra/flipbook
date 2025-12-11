import { FFmpeg } from "@ffmpeg/ffmpeg";
import { parseGIF, decompressFrames } from 'gifuct-js'
import { Sprite, PixelFrame } from "./Sprite";

async function canvasToUint8Array(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(async blob => {
      const arrayBuffer = await blob.arrayBuffer();
      resolve(new Uint8Array(arrayBuffer));
    }, "image/png");
  });
}

export async function canvasesToGif(canvases, msDelay) {
  //load ffmpeg
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();

  // Write each canvas as input frame to the virtual FS
  for (let i = 0; i < canvases.length; i++) {
    const data = await canvasToUint8Array(canvases[i]);
    const filename = `frame_${String(i).padStart(4, "0")}.png`;
    await ffmpeg.writeFile(filename, data);
  }

  const fps = Math.round(1000/msDelay);

  //generate gif pallette
  await ffmpeg.exec([
    "-framerate",String(fps),
    "-i", "frame_%04d.png",
    "-vf", "palettegen=stats_mode=diff",
    "palette.png"
  ]);

  // Build GIF
  await ffmpeg.exec([
    "-framerate", String(fps),
    "-i", "frame_%04d.png",
    "-i", "palette.png",
    "-filter_complex",
    "scale=iw:ih:flags=neighbor,paletteuse=dither=none",
    "-loop", "0",
    "output.gif"
  ]);

  // Read output from FFmpeg FS
  const gifData = await ffmpeg.readFile("output.gif");

  // Convert to Blob for download or display
  return new Blob([gifData], { type: "image/gif" });
}

export function gifToSprite(file,frameCallback){
  
  const reader = new FileReader();

  reader.onload = function(){
    //get array buffer from the file reader
    const arrayBuffer = reader.result;
    //array that's gonna hold the PixelFrame objects
    const spriteFrames = [];
    
    //idk but recommended by the docs: https://github.com/matt-way/gifuct-js
    if(arrayBuffer){

      //build gif object
      const gif = parseGIF(arrayBuffer);

      //get frame data (pass false bc we don't need to turn it into colors for drawing)
      const gifFrames = decompressFrames(gif,false);

      //loop over each frame, build & fill a new PixelFrame object with its data
      gifFrames.map((frame,frameIndex) => {
        spriteFrames.push(PixelFrame(gif.lsd.width,gif.lsd.height,0));
        frame.pixels.map((pixelValue,pixelIndex)=>{
          //get the x,y coords for the PixelFrame (using the gif frame offsets, and accounting for diff dimensions)
          const x = pixelIndex % frame.dims.width + frame.dims.left;
          const y = Math.trunc(pixelIndex / frame.dims.width) + frame.dims.top;
          spriteFrames[frameIndex].setPixel(x,y,(pixelValue == frame.transparentIndex || pixelValue == gif.lsd.backgroundColorIndex)?0:1);
        });
      });

      //send frames out via this callback
      frameCallback(spriteFrames);
    }
  }
  reader.readAsArrayBuffer(file);
}