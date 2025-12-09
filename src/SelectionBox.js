export const SelectionBox = function(){
    return{
        start:{x:0,y:0},
        end:{x:0,y:0},
        hasStarted:false,
        active:false,
        getWidth:function(){
            return Math.abs(this.start.x-this.end.x);
        },
        getHeight:function(){
            return Math.abs(this.start.y-this.end.y);
        },
        getOffsetLeft:function(){
            return Math.min(this.start.x,this.end.x);
        },
        getOffsetTop:function(){
            return Math.min(this.start.y,this.end.y);
        }
    }
};