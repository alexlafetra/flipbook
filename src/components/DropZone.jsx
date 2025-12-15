import { useEffect } from "react";

export const DropZone = ({title,callback}) => {
    function dropHandler(ev) {
        const files = [...ev.dataTransfer.items]
        .map((item) => item.getAsFile())
        .filter((file) => file);
        callback(files);
    }
    useEffect(()=>{
        //add in drop zone listeners
        window.addEventListener("drop", (e) => {
        if ([...e.dataTransfer.items].some((item) => item.kind === "file")) {
            e.preventDefault();
        }
        });

        window.addEventListener("dragover", (e) => {
        const fileItems = [...e.dataTransfer.items].filter(
            (item) => item.kind === "file",
        );
        if (fileItems.length > 0) {
            e.preventDefault();
            const dropZones = document.getElementsByClassName("drop-zone");
            for(let zone of dropZones){
                if(!zone.contains(e.target)){
                    e.dataTransfer.dropEffect = "none";
                    break;
                }
            };
        }
        });
    },[]);

    return(
        <label className = "drop-zone" onDrop = {dropHandler} onDragOver={(e)=>{
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
        }}>
          {title}
          <input type="file" id="file-input" multiple accept="image/*" style = {{display:'none'}} onInput={(e) => {callback(e.target.files)}} />
        </label>
    )
}