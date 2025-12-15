import { v4 as uuid } from "uuid";

const defaultSize = 16;

export const Sprite = () => {
    return {
        id: uuid(),
        frames : [PixelFrame(defaultSize,defaultSize,0)],
        width:defaultSize,
        height:defaultSize,
        currentFrame:0,
        fileName : 'sprite',
        nextFrame : function(){
            this.currentFrame = (this.currentFrame+1)%this.frames.length;
        },
        previousFrame : function(){
            this.currentFrame = this.currentFrame?((this.currentFrame - 1) % this.frames.length):(this.frames.length-1);
        },
        resize : function(width,height){
            this.width = width;
            this.height = height;
            for(let frame of this.frames){
                frame.resize(this.width,this.height);
            }
        }
    }
}

export const PixelFrame = (w,h,fill) => {
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
        },
        resize : function(width,height){
            if(width === this.width && height === this.height)
                return;
            const newData = [];
            for(let i = 0; i<width*height; i++){
                const coords = {x:i%width,y:Math.trunc(i/width)};
                if(coords.x < this.width && coords.y < this.height){
                    newData[i] = this.getPixel(coords.x,coords.y);
                }
                else{
                    newData[i] = 0;
                }
            }
            this.data = newData;
            this.width = width;
            this.height = height;
        },
        copyCanvas : function(canvas,useAlphaAsBg){
            const pixelData = canvas.getContext('2d').getImageData(0,0,this.width,this.height);
            for(let px = 0; px<pixelData.data.length/4;px++){
                let val;
                if(useAlphaAsBg){
                    val = pixelData.data[px*4+3] > 0;
                }
                else{
                    val = (pixelData.data[px*4]+pixelData.data[px*4+1]+pixelData.data[px*4+2])/3 > 122.5;
                }
                this.setPixel(px%this.width,Math.trunc(px/this.width),val?1:0);
            }
        },
        mirror : function(direction){
            let backupData = [];
            for(let x = 0; x<this.width; x++){
                for(let y = 0; y<this.height; y++){
                    if(direction == 'vertical'){
                        backupData[x+this.width*y] = this.data[(x)+this.width*(this.height-y-1)];
                    }
                    else if(direction == 'horizontal'){
                        backupData[x+this.width*y] = this.data[(this.width-x-1)+this.width*y];
                    }
                }
            }
            [this.data,backupData] = [backupData,this.data];
        }

    }
}