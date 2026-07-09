import{r as d,u as me,a as pe,h as he,b as C,j as t,f as y,B as g,i as K,k as H,l as be}from"./index-DqDoteUs.js";import{D as ge}from"./DataTable-5gmLlJZj.js";import{F as j,T as v}from"./Field-qU4W16hv.js";import{S as Y}from"./SectionCard-BbMkIZzC.js";import{S as q}from"./StatCard-JJ39YoYs.js";import{S as _e}from"./StatusBadge-dcsTUiYV.js";import{u as xe,a as U}from"./useDataRefresh-CbHz3ngi.js";import{S as ye}from"./react-select.esm-DGEfuAaZ.js";import{S as ve}from"./search-eE003Ay4.js";import"./xlsx-DrgRuPKf.js";import"./EmptyState-BXdpy7yG.js";import"./index-8JwjhRSi.js";import"./createLucideIcon-3yH8mwmC.js";const Z={customer_name:"",customer_phone:"",customer_address:"",pan_number:"",transport_name:"",notes:"",items:[{finished_good_id:"",qty_ordered:1}]},fe={PENDING:"warning",CONFIRMED:"info",PACKED:"neutral",DELIVERED:"success",CANCELLED:"danger"},Ne=["CONFIRMED","PACKED","DELIVERED"];function Te(){const[R,J]=d.useState(""),[O,Ce]=d.useState(""),{token:_,user:f}=me(),{showToast:N}=pe(),T=he(f==null?void 0:f.role,["ADMIN","CO_ADMIN"]),[A,Q]=d.useState([]),[x,X]=d.useState([]),[z,ee]=d.useState([]),[o,m]=d.useState(Z),[L,te]=d.useState("ALL"),D=d.useCallback(async()=>{const[e,r,s]=await Promise.all([C.getOrders(_,{limit:200}),C.getAvailability(_),C.getWarehouseStock(_)]);Q(e.data||[]),X(r.data||[]),ee(s.data||[])},[_]);d.useEffect(()=>{D().catch(console.error)},[D]),xe(D,"orders");const M=d.useMemo(()=>new Map(x.map(e=>[String(e.id),e])),[x]),re=d.useMemo(()=>{const e=new Map;return z.forEach(r=>{const s=String(r.finished_good_id),a=e.get(s)||[];a.push(r),e.set(s,a)}),e},[z]),P=x.reduce((e,r)=>(e.physical+=Number(r.physical_stock||0),e.reserved+=Number(r.reserved_qty||0),e.available+=Number(r.available_qty||0),e),{physical:0,reserved:0,available:0}),B=(e,r,s)=>{m(a=>({...a,items:a.items.map((i,l)=>l===e?{...i,[r]:s}:i)}))},ae=async e=>{e.preventDefault();try{const r={...o,customer_name:o.customer_name.trim(),customer_phone:o.customer_phone.trim(),customer_address:o.customer_address.trim(),pan_number:o.pan_number.trim(),transport_name:o.transport_name.trim(),notes:o.notes.trim(),items:o.items.map(s=>({finished_good_id:Number(s.finished_good_id),qty_ordered:Number(s.qty_ordered)}))};await C.createOrder(r,_),m(Z),await D(),U("orders"),N({tone:"success",title:"Order reserved",message:"Available stock was refreshed."})}catch(r){N({tone:"error",title:"Order failed",message:r.message})}},k=async(e,r,s="")=>{try{await C.updateOrderStatus(e,{status:r,...r==="CANCELLED"?{cancellation_reason:s}:{}},_),await D(),U("orders"),N({tone:"success",title:"Order updated",message:`Order marked ${r.toLowerCase()}.`})}catch(a){N({tone:"error",title:"Order update failed",message:a.message})}},se=e=>t.jsx("div",{className:"space-y-1",children:e.items.map(r=>t.jsxs("p",{children:[r.product_name," - ",y(r.qty_ordered)," ",r.unit]},r.id))}),ne=A.filter(e=>{var i,l,u,h;const r=R.toLowerCase(),s=((i=e.id)==null?void 0:i.toString().includes(r))||((l=e.customer_name)==null?void 0:l.toLowerCase().includes(r))||((u=e.status)==null?void 0:u.toLowerCase().includes(r))||((h=e.created_by_name)==null?void 0:h.toLowerCase().includes(r)),a=L==="ALL"||e.status===L;return s&&a});d.useMemo(()=>x.filter(e=>{var s,a,i;const r=O.toLowerCase();return((s=e.name)==null?void 0:s.toLowerCase().includes(r))||((a=e.article_code)==null?void 0:a.toLowerCase().includes(r))||((i=e.color)==null?void 0:i.toLowerCase().includes(r))}),[x,O]);const F=d.useMemo(()=>new Map(A.filter(e=>e.delivery_note_number).map(e=>[Number(e.id),e.delivery_note_number])),[A]),p=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"),S=e=>Number(e||0).toLocaleString(void 0,{maximumFractionDigits:2}),oe=(e=[],r=0)=>{let s=Number(r||0);const a=[],i=[...e].filter(l=>Number(l.quantity||0)>0).sort((l,u)=>{const h=new Date(l.updated_at||0).getTime(),w=new Date(u.updated_at||0).getTime();return h!==w?h-w:Number(l.id||0)-Number(u.id||0)});for(const l of i){if(s<=0)break;const u=Number(l.quantity||0),h=Math.min(u,s);a.push({warehouse_name:l.warehouse_name,quantity:h}),s-=h}return a},ie=(e="")=>{const r=new Date,s=K(r,{includeTime:!1}),a=H(r),i=r.toLocaleTimeString(),l=e.delivery_note_number||F.get(Number(e.id))||"-",u=(e.items||[]).map(n=>{const c=M.get(String(n.finished_good_id)),$=Number(n.qty_ordered||0),I=Number(n.inner_boxes_per_outer_box||(c==null?void 0:c.inner_boxes_per_outer_box)||0),de=I>0?$/I:0,V=n.warehouse_allocations||[],ce=re.get(String(n.finished_good_id))||[],ue=(V.length?V:oe(ce,$)).filter(E=>Number(E.quantity||0)>0).map(E=>`${E.warehouse_name} (${S(E.quantity)})`).join(", ")||"-";return{...n,pairs:$,pairsPerCarton:I,cartons:de,product_size:n.product_size||(c==null?void 0:c.size)||"-",warehouse_name:ue}}),h=u.reduce((n,c)=>n+c.pairs,0),w=u.reduce((n,c)=>n+c.cartons,0),le=u.map((n,c)=>`
          <tr>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${c+1}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${p(n.product_size)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${p(n.product_name)}
            </td>
            <td style="border:1px solid black;padding:4px;">
              ${p(n.warehouse_name)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${n.pairsPerCarton>0?S(n.cartons):"0"}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${S(n.pairs)} ${p(n.unit||"pairs")}
            </td>
          </tr>
        `).join(""),b=window.open("","_blank","width=900,height=700");if(!b){N({tone:"error",title:"Print blocked",message:"Allow popups for this site and try printing again."});return}C.logOrderPrint(e.id,_).catch(()=>{}),b.document.open(),b.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Delivery Note</title>
          <style>
            body {
              font-family: Arial;
              padding: 24px;
              color: black;
            }

            @page {
              size: A4;
              margin: 16mm;
              @bottom-right {
                content: "Page " counter(page) " of " counter(pages);
              }
            }

            @media print {
              body {
                padding: 0 0 22mm;
              }

              thead {
                display: table-header-group;
              }

              tr,
              .totals,
              .signature {
                break-inside: avoid;
                page-break-inside: avoid;
              }

              .page-number {
                display: block;
                position: fixed;
                right: 0;
                bottom: 0;
                font-size: 11px;
              }

              .page-number::after {
                content: "Page " counter(page) " of " counter(pages);
              }
            }

            .page-number {
              display: none;
            }

            .header {
              text-align: center;
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 10px;
            }

            .top-grid {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 10px;
            }

            .top-grid td {
              border: 1px solid black;
              padding: 10px;
              vertical-align: top;
            }

            table.items {
              width: 100%;
              border-collapse: collapse;
            }

            table.items th {
              border: 1px solid black;
              padding: 6px;
              background: #f3f3f3;
              text-align: left;
            }

            .totals {
              width: 100%;
              border-collapse: collapse;
              margin-top: 4px;
            }

            .totals td {
              border: 1px solid black;
              padding: 8px;
              font-weight: bold;
            }

            .totals .label {
              text-align: right;
            }

            .totals .value {
              text-align: center;
            }

            .signature {
              margin-top: 70px;
              display: flex;
              justify-content: space-between;
            }

            .signature div {
              text-align: center;
              width: 200px;
            }
          </style>
        </head>

        <body>
          <div class="header">DELIVERY NOTE</div>

          <table class="top-grid">
            <tr>
              <td width="60%">
                <strong>Dated</strong><br/>
                Nepali Date: ${a}<br/>
                English Date: ${s}<br/>
                Time: ${i}<br/>
                <strong>Transport Name:</strong> ${p(e.transport_name||"-")}<br/>
                <strong>Gate Pass No:</strong><br/>
                <strong>Bill No:</strong><br/>
              </td>
              <td width="40%">
                <strong>Delivery Note No:</strong> ${l}<br/>
                <strong>Created By:</strong> ${p(e.created_by_name||"-")}<br/>
                <strong>Customer Name:</strong> ${p(e.customer_name)}<br/>
                <strong>Address:</strong> ${p(e.customer_address||"-")}<br/>
                <strong>PAN Number:</strong> ${p(e.pan_number||"-")}
              </td>
            </tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th width="3%">SN</th>
                <th width="9%">Size</th>
                <th width="30%">Description of Goods</th>
                <th width="9%">Warehouse</th>
                <th width="9%">Carton</th>
                <th width="10%">Pairs</th>
              </tr>
            </thead>
            <tbody>
              ${le}
            </tbody>
          </table>

          <table class="totals">
            <tr>
              <td class="label" width="55%">Total</td>
               <td class="value" width="18%"></td>
              <td class="value" width="16%">${S(w)}</td>
              <td class="value" width="11%">${S(h)} pairs</td>
            </tr>
          </table>

          <div class="signature">
            <div>
              ___________________<br/>
              Delivered By
            </div>
            <div>
              ___________________<br/>
              Received By
            </div>
            <div>
              ___________________<br/>
              Printed By </br> 
              (${p((f==null?void 0:f.name)||"User")})
            </div>
          </div>

          <div class="page-number"></div>
        </body>
      </html>
    `),b.document.close();let W=!1;const G=()=>{W||b.closed||(W=!0,b.focus(),b.print())};b.onafterprint=()=>{b.close()},b.addEventListener("load",()=>{setTimeout(G,100)},{once:!0}),setTimeout(G,700)};return t.jsxs("div",{className:"space-y-6",children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-3",children:[t.jsx(q,{label:"Physical Stock",value:y(P.physical),icon:"finishedGoods"}),t.jsx(q,{label:"Reserved Stock",value:y(P.reserved),tone:"alert",icon:"orders"}),t.jsx(q,{label:"Available Stock",value:y(P.available),tone:"calm",icon:"check"})]}),t.jsx(Y,{title:"Create order",subtitle:"Creating an order reserves available finished goods but does not reduce physical stock yet.",icon:"orders",children:t.jsxs("form",{className:"space-y-5",onSubmit:ae,children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-2 xl:grid-cols-3",children:[t.jsx(j,{label:"Customer name",children:t.jsx(v,{value:o.customer_name,onChange:e=>m(r=>({...r,customer_name:e.target.value})),required:!0})}),t.jsx(j,{label:"Customer phone",children:t.jsx(v,{type:"tel",maxLength:10,pattern:"[0-9]{10}",value:o.customer_phone,onChange:e=>{const r=e.target.value.replace(/\D/g,"").slice(0,10);m(s=>({...s,customer_phone:r}))},required:!0})}),t.jsx(j,{label:"Customer Address",children:t.jsx(v,{value:o.customer_address,onChange:e=>{const r=e.target.value.replace(/[^a-zA-Z\s]/g,"");m(s=>({...s,customer_address:r}))},required:!0})}),t.jsx(j,{label:"PAN Number",children:t.jsx(v,{type:"text",maxLength:9,pattern:"[0-9]{9}",value:o.pan_number,onChange:e=>{const r=e.target.value.replace(/\D/g,"").slice(0,9);m(s=>({...s,pan_number:r}))},required:!0})}),t.jsx(j,{label:"Transport Name",children:t.jsx(v,{value:o.transport_name,onChange:e=>m(r=>({...r,transport_name:e.target.value})),required:!0})}),t.jsx(j,{label:"Notes",children:t.jsx(v,{value:o.notes,onChange:e=>m(r=>({...r,notes:e.target.value}))})})]}),t.jsx("div",{className:"space-y-3",children:o.items.map((e,r)=>{const s=M.get(String(e.finished_good_id));return t.jsxs("div",{className:"grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]",children:[t.jsx(ye,{options:x.map(a=>({value:String(a.id),label:`${a.name} (${a.article_code}) - available ${y(a.available_qty)} ${a.unit}`})),value:x.map(a=>({value:String(a.id),label:`${a.name} (${a.article_code}) - available ${y(a.available_qty)} ${a.unit}`})).find(a=>a.value===String(e.finished_good_id))||null,onChange:a=>B(r,"finished_good_id",(a==null?void 0:a.value)||""),placeholder:"Search finished good...",isClearable:!0,menuPortalTarget:document.body,menuPosition:"fixed",styles:{control:a=>({...a,minHeight:"44px",borderRadius:"12px",borderColor:"#d1d5db",boxShadow:"none",fontSize:"14px"}),menuPortal:a=>({...a,zIndex:9999})}}),t.jsx(v,{type:"number",min:"1",step:"1",value:e.qty_ordered,onChange:a=>B(r,"qty_ordered",a.target.value),required:!0}),t.jsxs("div",{className:"rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600",children:["Available: ",s?`${y(s.available_qty)} ${s.unit}`:"-"]}),t.jsx(g,{type:"button",variant:"danger",disabled:o.items.length===1,onClick:()=>m(a=>({...a,items:a.items.filter((i,l)=>l!==r)})),children:"Remove"})]},r)})}),t.jsxs("div",{className:"flex flex-wrap gap-3",children:[t.jsx(g,{type:"button",variant:"secondary",icon:"plus",onClick:()=>m(e=>({...e,items:[...e.items,{finished_good_id:"",qty_ordered:1}]})),children:"Add item"}),t.jsx(g,{type:"submit",icon:"check",children:"Reserve order"})]})]})}),t.jsxs(Y,{title:"Orders",subtitle:T?"Admin can move orders through confirmation, packing, delivery, or cancellation.":"Your reserved orders.",icon:"orders",children:[t.jsxs("div",{className:"flex justify-between px-2 py-3 mb-1",children:[t.jsxs("div",{className:"relative",children:[t.jsx(ve,{size:16,className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"}),t.jsx("input",{type:"text",placeholder:"Search orders...",value:R,onChange:e=>J(e.target.value),className:"rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none"})]}),t.jsxs("select",{value:L,onChange:e=>te(e.target.value),className:"rounded-xl border border-black bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none",children:[t.jsx("option",{value:"ALL",children:"All Status"}),t.jsx("option",{value:"PENDING",children:"Pending"}),t.jsx("option",{value:"CONFIRMED",children:"Confirmed"}),t.jsx("option",{value:"PACKED",children:"Packed"}),t.jsx("option",{value:"DELIVERED",children:"Delivered"}),t.jsx("option",{value:"CANCELLED",children:"Cancelled"})]})]}),t.jsx(ge,{columns:[{key:"id",label:"Order-ID"},{key:"customer_details",label:"Customer Details",render:e=>t.jsxs("div",{children:[t.jsx("strong",{children:e.customer_name||"-"}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Phone: ",e.customer_phone||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Address: ",e.customer_address||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["PAN: ",e.pan_number||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Transport: ",e.transport_name||"-"]})]})},{key:"items",label:"Items",render:se},{key:"status",label:"Status",render:e=>t.jsx(_e,{tone:fe[e.status],children:e.status})},{key:"cancellation_reason",label:"Cancel Reason",render:e=>e.status==="CANCELLED"&&e.cancellation_reason||"-"},{key:"created_by_name",label:"Created By"},{key:"created_at",label:"Created",render:e=>t.jsxs("div",{className:"flex flex-col",children:[t.jsx("strong",{children:K(e.created_at,{includeTime:!1})}),t.jsxs("span",{className:"text-xs text-slate-500",children:["BS ",H(e.created_at)]}),t.jsx("span",{className:"text-xs text-slate-500",children:be(e.created_at)})]})},T?{key:"actions",label:"Actions",render:e=>{const r=Ne.includes(e.status),s=!["DELIVERED","CANCELLED"].includes(e.status);return!r&&!s?null:t.jsxs("div",{className:"flex flex-wrap gap-2",children:[r?t.jsx(g,{size:"sm",variant:"secondary",onClick:()=>ie(e),children:"🖨️ DN"}):null,s?t.jsxs(t.Fragment,{children:[e.status==="PENDING"?t.jsx(g,{size:"sm",variant:"secondary",onClick:()=>k(e.id,"CONFIRMED"),children:"Confirm"}):null,["PENDING","CONFIRMED"].includes(e.status)?t.jsx(g,{size:"sm",variant:"secondary",onClick:()=>k(e.id,"PACKED"),children:"Pack"}):null,t.jsx(g,{size:"sm",icon:"check",onClick:()=>{window.confirm(`Are you sure you want to mark Order #${e.id} as delivered?

Customer: ${e.customer_name}
This action cannot be undone.`)&&k(e.id,"DELIVERED")},children:"Deliver"}),t.jsx(g,{size:"sm",variant:"danger",onClick:()=>{const a=window.prompt("Why is this order being cancelled?");if(a===null)return;const i=a.trim();if(!i){N({tone:"error",title:"Cancel reason required",message:"Please enter why the order is being cancelled."});return}k(e.id,"CANCELLED",i)},children:"Cancel"})]}):null]})}}:{key:"empty",label:""},{key:"confirmed_by_name",label:"Confirmed By / DN",render:e=>{const r=e.delivery_note_number||F.get(Number(e.id))||"-";return t.jsxs(t.Fragment,{children:[e.confirmed_by_name||"-",t.jsx("br",{}),t.jsx("small",{style:{color:"#666"},children:r})]})}}],rows:ne})]})]})}export{Te as default};
