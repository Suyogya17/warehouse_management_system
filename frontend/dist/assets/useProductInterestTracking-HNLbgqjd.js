import{c as d,r as s,d as m}from"./index-CdoiL8Ab.js";/**
 * @license lucide-react v1.12.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],g=d("check",u),h=({token:t,search:n,resultCount:c,surface:i})=>{const a=s.useRef("");return s.useEffect(()=>{const e=String(n||"").trim();if(!t||e.length<2)return;const r=`${i}:${e.toLowerCase()}:${Number(c||0)}`,o=window.setTimeout(()=>{a.current!==r&&(a.current=r,m.trackProductSearch({search_term:e,result_count:Number(c||0),surface:i},t).catch(()=>{}))},900);return()=>window.clearTimeout(o)},[c,n,i,t]),s.useCallback(e=>{const r=Number((e==null?void 0:e.id)??(e==null?void 0:e.finished_good_id));!t||!Number.isInteger(r)||r<=0||m.trackProductInterest({finished_good_id:r,search_term:String(n||"").trim()||void 0,surface:i},t).catch(()=>{})},[n,i,t])};export{g as C,h as u};
