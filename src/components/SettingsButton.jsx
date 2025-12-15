export function Setting({text,state,callback}){
    return(
        <div style = {{border:'none'}} className = "button" onClick = {callback}>
            {`${text}: `}{state && <span style = {{color:'white',backgroundColor:'blue',borderRadius:'10px',padding:'4px'}}>{"ON" }</span>}
            {!state && `OFF`}
        </div>
    )
}