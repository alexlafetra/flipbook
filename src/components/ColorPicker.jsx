import { useState } from 'react'
import { RgbaColorPicker } from "react-colorful";

function hexToRgba(hex) {
  const raw = hex.replace("#", "");
  const bigint = parseInt(raw, 16);

  const r = (bigint >> 24) & 255;
  const g = (bigint >> 16) & 255;
  const b = (bigint >> 8) & 255;
  const a = (bigint & 255)/255.0;

  return { r, g, b, a };
}

function rgbaToHex(rgbaColor){
    const r = rgbaColor.r.toString(16).padStart(2,'0');
    const g = rgbaColor.g.toString(16).padStart(2,'0');
    const b = rgbaColor.b.toString(16).padStart(2,'0');
    let a = Math.trunc(rgbaColor.a * 255);
    a = a.toString(16).padStart(2,'0');
    return '#'+r+g+b+a;
}

export function ColorPicker({label,callback,defaultValue}){

    const [value,setValue] = useState(hexToRgba(defaultValue));

    const callbackFn = (rgbaColor) => {
        callback(rgbaToHex(rgbaColor));
        setValue(rgbaColor);
    }

    return(
        <div className = 'colorpicker' style = {{width:'50px',height:'120px',padding:'10px',display:'flex',justifyContent:'center',flexDirection:'row'}}>
            <div className = "colorpicker_label">{label}</div>
            <RgbaColorPicker style = {{cursor:'pointer',width:'100%',height:'100%'}}color={value} onChange={callbackFn}/>
        </div>
    )
}

export default ColorPicker;