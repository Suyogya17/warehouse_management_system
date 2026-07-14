import{c as d}from"./createLucideIcon-BBZQ3Bch.js";/**
 * @license lucide-react v1.12.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],a=d("check",u),c=r=>{const e=Number(r==null?void 0:r.display_order);return Number.isFinite(e)&&e>0?e:999999},n=(r,e)=>{const o=c(r)-c(e);return o!==0?o:Number((r==null?void 0:r.id)||0)-Number((e==null?void 0:e.id)||0)},i=(r=[])=>Math.min(...r.map(c)),y=(r,e)=>{const o=i(r)-i(e);if(o!==0)return o;const s=[...r].sort(n)[0],t=[...e].sort(n)[0];return Number((s==null?void 0:s.id)||0)-Number((t==null?void 0:t.id)||0)};export{a as C,y as a,n as s};
