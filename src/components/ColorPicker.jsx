import { RgbaColorPicker } from "react-colorful";

export function hexToRGBA(hex) {
  const raw = hex.replace("#", "");
  const bigint = parseInt(raw, 16);

  const r = (bigint >> 24) & 255;
  const g = (bigint >> 16) & 255;
  const b = (bigint >> 8) & 255;
  const a = (bigint & 255)/255.0;

  return { r, g, b, a };
}

export function rgbaToHex(rgbaColor){
    const r = rgbaColor.r.toString(16).padStart(2,'0');
    const g = rgbaColor.g.toString(16).padStart(2,'0');
    const b = rgbaColor.b.toString(16).padStart(2,'0');
    let a = Math.trunc(rgbaColor.a * 255);
    a = a.toString(16).padStart(2,'0');
    return '#'+r+g+b+a;
}

export function ColorPicker({label,callback,value}){

    const callbackFn = (rgbaColor) => {
        callback(rgbaToHex(rgbaColor));
    }

    return(
        <div className = 'colorpicker' style = {{width:'50px',height:'120px',padding:'10px',display:'flex',justifyContent:'center',flexDirection:'row'}}>
            <div className = "colorpicker_label">{label}</div>
            <RgbaColorPicker style = {{cursor:'pointer',width:'100%',height:'100%'}}color={hexToRGBA(value)} onChange={callbackFn}/>
        </div>
    )
}

export default ColorPicker;