import {useState} from "react";

export function TabTitle({value,callbackFn}){
    const [isEditing,setIsEditing] = useState(false);
    return(
        <div>
            {isEditing?(
                <textarea style = {{color:'black',border:'none',borderRadius:'2px',padding:'2px',fieldSizing:'content',height:'1em',resize:'none',alignContent:'center'}} autoFocus value = {value} onChange={(e) => {
                    callbackFn(e);
                }} onBlur = {()=>{setIsEditing(false)}} 
                onKeyDown = {(e) => {if(e.key === "Enter" && !e.shiftKey){
                    e.preventDefault();
                    setIsEditing(false);
                }}}></textarea>
            ):(
                <div onDoubleClick={()=>setIsEditing(true)}>{value}</div>
            )}
        </div>
    )
}