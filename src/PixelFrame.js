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
        }
    }
}