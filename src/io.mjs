export function downloadFile(name,text,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const fmt=(value,digits=2)=>value==null?'—':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
