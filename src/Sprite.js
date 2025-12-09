import { PixelFrame } from "./PixelFrame";
import { v4 as uuid } from "uuid";

export const Sprite = () => {
    return {
        id: uuid(),
        frames : [PixelFrame(16,16,0)],
        width:16,
        height:16,
        currentFrame:0,
        fileName : 'new_sprite',
        nextFrame : function(){
            this.currentFrame = (this.currentFrame+1)%this.frames.length;
        },
        previousFrame : function(){
            this.currentFrame = this.currentFrame?((this.currentFrame - 1) % this.frames.length):(this.frames.length-1);
        }
    }
}