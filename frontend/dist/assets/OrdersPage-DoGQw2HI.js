import{r as c,u as De,a as ke,k as Se,d as y,j as t,f as w,B as h,l as te,m as re,n as Ee}from"./index-CQk7gPoH.js";import{D as Pe}from"./DataTable-BeAPs2tB.js";import{F as j,T as v}from"./Field-CkXxiYGZ.js";import{S as se}from"./SectionCard-CYyza63t.js";import{S as V}from"./StatCard-CEZlch4A.js";import{S as Ae}from"./StatusBadge-D9QKoA1f.js";import{u as $e,a as A}from"./useDataRefresh-lDvemPhp.js";import{S as ae}from"./react-select.esm-cwGE3ptk.js";import{S as Oe}from"./search-DM434Qf2.js";import"./EmptyState-CJFRYrrg.js";import"./index-8JwjhRSi.js";const ne={customer_name:"",customer_phone:"",customer_address:"",pan_number:"",transport_name:"",notes:"",items:[{finished_good_id:"",qty_ordered:1}]},Re={PENDING:"warning",CONFIRMED:"info",PACKED:"neutral",DELIVERED:"success",CANCELLED:"danger"},Le=["CONFIRMED","PACKED","DELIVERED"],Ie=new Set(["suyogya shrestha","suyogya shresth","suvarna shrestha","hirdaya shrestha"]),qe=(S={})=>String(S.role||"").toUpperCase()==="CO_ADMIN"&&Ie.has(String(S.name||"").trim().replace(/\s+/g," ").toLowerCase());function Je(){const[S,oe]=c.useState(""),[K,Te]=c.useState(""),{token:b,user:D}=De(),{showToast:p}=ke(),E=Se(D==null?void 0:D.role,["ADMIN","CO_ADMIN"]),ie=qe(D),[T,le]=c.useState([]),[f,de]=c.useState([]),[H,ce]=c.useState([]),[u,_]=c.useState(ne),[z,ue]=c.useState("ALL"),[$,O]=c.useState(null),[R,k]=c.useState([]),[U,M]=c.useState(""),[L,Y]=c.useState(!1),N=c.useCallback(async()=>{const[e,r,a]=await Promise.all([y.getOrders(b,{limit:200}),y.getAvailability(b,{includeHidden:E}),y.getWarehouseStock(b)]);le(e.data||[]),de(r.data||[]),ce(a.data||[])},[E,b]);c.useEffect(()=>{N().catch(console.error)},[N]),$e(N,"orders");const F=c.useMemo(()=>new Map(f.map(e=>[String(e.id),e])),[f]),me=c.useMemo(()=>{const e=new Map;return H.forEach(r=>{const a=String(r.finished_good_id),s=e.get(a)||[];s.push(r),e.set(a,s)}),e},[H]),B=f.reduce((e,r)=>(e.physical+=Number(r.physical_stock||0),e.reserved+=Number(r.reserved_qty||0),e.available+=Number(r.available_qty||0),e),{physical:0,reserved:0,available:0}),Z=(e,r,a)=>{_(s=>({...s,items:s.items.map((i,n)=>n===e?{...i,[r]:a}:i)}))},he=async e=>{e.preventDefault();try{const r={...u,customer_name:u.customer_name.trim(),customer_phone:u.customer_phone.trim(),customer_address:u.customer_address.trim(),pan_number:u.pan_number.trim(),transport_name:u.transport_name.trim(),notes:u.notes.trim(),items:u.items.map(a=>({finished_good_id:Number(a.finished_good_id),qty_ordered:Number(a.qty_ordered)}))};await y.createOrder(r,b),_(ne),await N(),A("orders"),p({tone:"success",title:"Order reserved",message:"Available stock was refreshed."})}catch(r){p({tone:"error",title:"Order failed",message:r.message})}},I=async(e,r,a="")=>{try{await y.updateOrderStatus(e,{status:r,...r==="CANCELLED"?{cancellation_reason:a}:{}},b),await N(),A("orders"),p({tone:"success",title:"Order updated",message:`Order marked ${r.toLowerCase()}.`})}catch(s){p({tone:"error",title:"Order update failed",message:s.message})}},pe=async e=>{try{const r=await y.assignOrderDeliveryNote(e.id,b);await N(),A("orders"),p({tone:"success",title:"Delivery note assigned",message:r.message||`A delivery-note number was assigned to Order #${e.id}.`})}catch(r){p({tone:"error",title:"Could not assign DN",message:r.message})}},ge=async e=>{const r=window.prompt(`Why are you reopening packing for Order #${e.id}?

The existing delivery note number will remain unchanged.`);if(r===null)return;const a=r.trim();if(!a){p({tone:"error",title:"Reason required",message:"Enter why this packed order needs to be corrected."});return}try{const s=await y.reopenOrderPacking(e.id,a,b);await N(),A("orders"),p({tone:"success",title:"Packing reopened",message:s.message||`${e.delivery_note_number||"Delivery note"} was preserved. You can now correct CTN.`})}catch(s){p({tone:"error",title:"Could not reopen packing",message:s.message})}},be=e=>{O(e),M(""),k((e.items||[]).map(r=>({finished_good_id:String(r.finished_good_id),carton_qty:Number(r.inner_boxes_per_outer_box)>0?Number(r.qty_ordered||0)/Number(r.inner_boxes_per_outer_box):""})))},_e=async e=>{if(e.preventDefault(),!!$){Y(!0);try{await y.correctOrderItems($.id,{reason:U.trim(),items:R.map(r=>({finished_good_id:Number(r.finished_good_id),carton_qty:Number(r.carton_qty)}))},b),O(null),k([]),M(""),await N(),A("orders"),p({tone:"success",title:"Order corrected",message:"Reserved stock was recalculated automatically."})}catch(r){p({tone:"error",title:"Correction failed",message:r.message})}finally{Y(!1)}}},xe=e=>t.jsx("div",{className:"space-y-1",children:e.items.map(r=>t.jsxs("p",{children:[r.product_name," - ",w(r.qty_ordered)," ",r.unit]},r.id))}),ye=T.filter(e=>{var i,n,m,l;const r=S.toLowerCase(),a=((i=e.id)==null?void 0:i.toString().includes(r))||((n=e.customer_name)==null?void 0:n.toLowerCase().includes(r))||((m=e.status)==null?void 0:m.toLowerCase().includes(r))||((l=e.created_by_name)==null?void 0:l.toLowerCase().includes(r)),s=z==="ALL"||e.status===z;return a&&s});c.useMemo(()=>f.filter(e=>{var a,s,i;const r=K.toLowerCase();return((a=e.name)==null?void 0:a.toLowerCase().includes(r))||((s=e.article_code)==null?void 0:s.toLowerCase().includes(r))||((i=e.color)==null?void 0:i.toLowerCase().includes(r))}),[f,K]);const J=c.useMemo(()=>new Map(T.filter(e=>e.delivery_note_number).map(e=>[Number(e.id),e.delivery_note_number])),[T]),g=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"),P=e=>Number(e||0).toLocaleString(void 0,{maximumFractionDigits:2}),ve=(e=[],r=0)=>{let a=Number(r||0);const s=[],i=[...e].filter(n=>Number(n.quantity||0)>0).sort((n,m)=>{const l=new Date(n.updated_at||0).getTime(),C=new Date(m.updated_at||0).getTime();return l!==C?l-C:Number(n.id||0)-Number(m.id||0)});for(const n of i){if(a<=0)break;const m=Number(n.quantity||0),l=Math.min(m,a);s.push({warehouse_name:n.warehouse_name,quantity:l}),a-=l}return s},fe=(e="")=>{const r=new Date,a=te(r,{includeTime:!1}),s=re(r),i=r.toLocaleTimeString(),n=e.delivery_note_number||J.get(Number(e.id))||"-",m=(e.items||[]).map(o=>{const d=F.get(String(o.finished_good_id)),W=Number(o.qty_ordered||0),G=Number(o.inner_boxes_per_outer_box||(d==null?void 0:d.inner_boxes_per_outer_box)||0),Ce=G>0?W/G:0,ee=o.warehouse_allocations||[],we=me.get(String(o.finished_good_id))||[],je=(ee.length?ee:ve(we,W)).filter(q=>Number(q.quantity||0)>0).map(q=>`${q.warehouse_name} (${P(q.quantity)})`).join(", ")||"-";return{...o,pairs:W,pairsPerCarton:G,cartons:Ce,finished_good_id:o.finished_good_id||(d==null?void 0:d.id)||"-",product_id:o.product_id||o.article_code||(d==null?void 0:d.article_code)||"-",product_size:o.product_size||(d==null?void 0:d.size)||"-",warehouse_name:je}}),l=m.reduce((o,d)=>o+d.pairs,0),C=m.reduce((o,d)=>o+d.cartons,0),Ne=m.map((o,d)=>`
          <tr>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${d+1}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${g(o.finished_good_id)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${g(o.product_id)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${g(o.product_size)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${g(o.product_name)}
            </td>
            <td style="border:1px solid black;padding:4px;">
              ${g(o.warehouse_name)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${o.pairsPerCarton>0?P(o.cartons):"0"}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${P(o.pairs)} ${g(o.unit||"pairs")}
            </td>
          </tr>
        `).join(""),x=window.open("","_blank","width=900,height=700");if(!x){p({tone:"error",title:"Print blocked",message:"Allow popups for this site and try printing again."});return}y.logOrderPrint(e.id,b).catch(()=>{}),x.document.open(),x.document.write(`
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
                Nepali Date: ${s}<br/>
                English Date: ${a}<br/>
                Time: ${i}<br/>
                <strong>Transport Name:</strong> ${g(e.transport_name||"-")}<br/>
                <strong>Gate Pass No:</strong><br/>
                <strong>Bill No:</strong><br/>
              </td>
              <td width="40%">
                <strong>Delivery Note No:</strong> ${n}<br/>
                <strong>Created By:</strong> ${g(e.created_by_name||"-")}<br/>
                <strong>Customer Name:</strong> ${g(e.customer_name)}<br/>
                <strong>Phone Number:</strong> ${g(e.customer_phone||"-")}<br/>
                <strong>Address:</strong> ${g(e.customer_address||"-")}<br/>
                <strong>PAN Number:</strong> ${g(e.pan_number||"-")}
              </td>
            </tr>
          </table>

          <table class="items">
            <thead>
              <tr>
                <th width="3%">SN</th>
                <th width="7%">F.G. ID</th>
                <th width="11%">Product ID</th>
                <th width="8%">Size</th>
                <th width="27%">Description of Goods</th>
                <th width="15%">Warehouse</th>
                <th width="9%">Carton</th>
                <th width="10%">Pairs</th>
              </tr>
            </thead>
            <tbody>
              ${Ne}
            </tbody>
          </table>

          <table class="totals">
            <tr>
              <td class="label" width="81%">Total</td>
              <td class="value" width="9%">${P(C)}</td>
              <td class="value" width="10%">${P(l)} pairs</td>
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
              (${g((D==null?void 0:D.name)||"User")})
            </div>
          </div>

          <div class="page-number"></div>
        </body>
      </html>
    `),x.document.close();let Q=!1;const X=()=>{Q||x.closed||(Q=!0,x.focus(),x.print())};x.onafterprint=()=>{x.close()},x.addEventListener("load",()=>{setTimeout(X,100)},{once:!0}),setTimeout(X,700)};return t.jsxs("div",{className:"space-y-4",children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-3",children:[t.jsx(V,{label:"Physical Stock",value:w(B.physical),icon:"finishedGoods"}),t.jsx(V,{label:"Reserved Stock",value:w(B.reserved),tone:"alert",icon:"orders"}),t.jsx(V,{label:"Available Stock",value:w(B.available),tone:"calm",icon:"check"})]}),t.jsx(se,{title:"Create order",subtitle:"Creating an order reserves available finished goods but does not reduce physical stock yet.",icon:"orders",children:t.jsxs("form",{className:"space-y-5",onSubmit:he,children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-2 xl:grid-cols-3",children:[t.jsx(j,{label:"Customer name",children:t.jsx(v,{value:u.customer_name,onChange:e=>_(r=>({...r,customer_name:e.target.value})),required:!0})}),t.jsx(j,{label:"Customer phone",children:t.jsx(v,{type:"tel",maxLength:10,pattern:"[0-9]{10}",value:u.customer_phone,onChange:e=>{const r=e.target.value.replace(/\D/g,"").slice(0,10);_(a=>({...a,customer_phone:r}))},required:!0})}),t.jsx(j,{label:"Customer Address",children:t.jsx(v,{value:u.customer_address,onChange:e=>{const r=e.target.value.replace(/[^a-zA-Z\s]/g,"");_(a=>({...a,customer_address:r}))},required:!0})}),t.jsx(j,{label:"PAN Number",children:t.jsx(v,{type:"text",maxLength:9,pattern:"[0-9]{9}",value:u.pan_number,onChange:e=>{const r=e.target.value.replace(/\D/g,"").slice(0,9);_(a=>({...a,pan_number:r}))},required:!0})}),t.jsx(j,{label:"Transport Name",children:t.jsx(v,{value:u.transport_name,onChange:e=>_(r=>({...r,transport_name:e.target.value})),required:!0})}),t.jsx(j,{label:"Notes",children:t.jsx(v,{value:u.notes,onChange:e=>_(r=>({...r,notes:e.target.value}))})})]}),t.jsx("div",{className:"space-y-3",children:u.items.map((e,r)=>{const a=F.get(String(e.finished_good_id));return t.jsxs("div",{className:"grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]",children:[t.jsx(ae,{options:f.map(s=>({value:String(s.id),label:`${s.name} (${s.article_code}) - available ${w(s.available_qty)} ${s.unit}`})),value:f.map(s=>({value:String(s.id),label:`${s.name} (${s.article_code}) - available ${w(s.available_qty)} ${s.unit}`})).find(s=>s.value===String(e.finished_good_id))||null,onChange:s=>Z(r,"finished_good_id",(s==null?void 0:s.value)||""),placeholder:"Search finished good...",isClearable:!0,menuPortalTarget:document.body,menuPosition:"fixed",styles:{control:s=>({...s,minHeight:"44px",borderRadius:"12px",borderColor:"#d1d5db",boxShadow:"none",fontSize:"14px"}),menuPortal:s=>({...s,zIndex:9999})}}),t.jsx(v,{type:"number",min:"1",step:"1",value:e.qty_ordered,onChange:s=>Z(r,"qty_ordered",s.target.value),required:!0}),t.jsxs("div",{className:"rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600",children:["Available: ",a?`${w(a.available_qty)} ${a.unit}`:"-"]}),t.jsx(h,{type:"button",variant:"danger",disabled:u.items.length===1,onClick:()=>_(s=>({...s,items:s.items.filter((i,n)=>n!==r)})),children:"Remove"})]},r)})}),t.jsxs("div",{className:"flex flex-wrap gap-3",children:[t.jsx(h,{type:"button",variant:"secondary",icon:"plus",onClick:()=>_(e=>({...e,items:[...e.items,{finished_good_id:"",qty_ordered:1}]})),children:"Add item"}),t.jsx(h,{type:"submit",icon:"check",children:"Reserve order"})]})]})}),t.jsxs(se,{title:"Orders",subtitle:E?"Admin can move orders through confirmation, packing, delivery, or cancellation.":"Your reserved orders.",icon:"orders",children:[t.jsxs("div",{className:"mb-1 flex flex-col items-stretch justify-between gap-3 px-1 py-2 sm:flex-row sm:items-center",children:[t.jsxs("div",{className:"relative w-full sm:w-auto",children:[t.jsx(Oe,{size:16,className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"}),t.jsx("input",{type:"text",placeholder:"Search orders...",value:S,onChange:e=>oe(e.target.value),className:"w-full rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none sm:w-auto"})]}),t.jsxs("select",{value:z,onChange:e=>ue(e.target.value),className:"rounded-xl border border-black bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none",children:[t.jsx("option",{value:"ALL",children:"All Status"}),t.jsx("option",{value:"PENDING",children:"Pending"}),t.jsx("option",{value:"CONFIRMED",children:"Confirmed"}),t.jsx("option",{value:"PACKED",children:"Packed"}),t.jsx("option",{value:"DELIVERED",children:"Delivered"}),t.jsx("option",{value:"CANCELLED",children:"Cancelled"})]})]}),t.jsx(Pe,{columns:[{key:"id",label:"Order-ID",width:"4%",align:"center"},{key:"customer_details",label:"Customer Details",width:"14%",render:e=>t.jsxs("div",{className:"min-w-0",children:[t.jsx("strong",{children:e.customer_name||"-"}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Phone: ",e.customer_phone||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Address: ",e.customer_address||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["PAN: ",e.pan_number||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Transport: ",e.transport_name||"-"]})]})},{key:"items",label:"Items",width:"20%",render:xe},{key:"status",label:"Status",width:"7%",align:"center",render:e=>t.jsx(Ae,{tone:Re[e.status],children:e.status})},{key:"cancellation_reason",label:"Cancel Reason",width:"10%",render:e=>e.status==="CANCELLED"&&e.cancellation_reason||"-"},{key:"created_by_name",label:"Created By",width:"8%",align:"center"},{key:"created_at",label:"Created",width:"9%",align:"center",render:e=>t.jsxs("div",{className:"flex flex-col",children:[t.jsx("strong",{children:te(e.created_at,{includeTime:!1})}),t.jsxs("span",{className:"text-xs text-slate-500",children:["BS ",re(e.created_at)]}),t.jsx("span",{className:"text-xs text-slate-500",children:Ee(e.created_at)})]})},E?{key:"actions",label:"Actions",width:"9%",align:"center",render:e=>{const r=Le.includes(e.status),a=!["DELIVERED","CANCELLED"].includes(e.status);return!r&&!a?null:t.jsxs("div",{className:"grid gap-1",children:[r?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>fe(e),children:"🖨️ DN"}):null,a?t.jsxs(t.Fragment,{children:[e.status==="PENDING"?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>I(e.id,"CONFIRMED"),children:"Confirm"}):null,["PENDING","CONFIRMED"].includes(e.status)?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>I(e.id,"PACKED"),children:"Pack"}):null,t.jsx(h,{size:"sm",icon:"check",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>{window.confirm(`Are you sure you want to mark Order #${e.id} as delivered?

Customer: ${e.customer_name}
This action cannot be undone.`)&&I(e.id,"DELIVERED")},children:"Deliver"}),t.jsx(h,{size:"sm",variant:"danger",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>{const s=window.prompt("Why is this order being cancelled?");if(s===null)return;const i=s.trim();if(!i){p({tone:"error",title:"Cancel reason required",message:"Please enter why the order is being cancelled."});return}I(e.id,"CANCELLED",i)},children:"Cancel"})]}):null]})}}:{key:"empty",label:"",width:"12%"},{key:"confirmed_by_name",label:"Confirmed By / DN",width:"11%",align:"center",render:e=>{const r=e.delivery_note_number||J.get(Number(e.id))||"-";return t.jsxs("div",{className:"space-y-1",children:[e.confirmed_by_name||"-",t.jsx("br",{}),t.jsx("small",{style:{color:"#666"},children:r}),!e.delivery_note_number&&["CONFIRMED","PACKED","DELIVERED"].includes(e.status)?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>pe(e),children:"Assign DN"}):null]})}},E?{key:"order_edits",label:"Order Edits",width:"8%",align:"center",render:e=>ie?e.status==="PACKED"?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>ge(e),children:"Reopen packing"}):["PENDING","CONFIRMED"].includes(e.status)?t.jsx(h,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>be(e),children:"Correct CTN"}):t.jsx("span",{className:"text-slate-400",children:"Locked"}):t.jsx("span",{className:"text-slate-400",children:"-"})}:{key:"order_edits_empty",label:"",width:"8%"}],rows:ye,fitColumns:!0,wrapCells:!0,responsiveScroll:!0})]}),$?t.jsx("div",{className:"fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm",onMouseDown:()=>!L&&O(null),children:t.jsxs("form",{onSubmit:_e,onMouseDown:e=>e.stopPropagation(),className:"max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl",children:[t.jsxs("div",{children:[t.jsxs("h2",{className:"text-lg font-bold text-slate-950",children:["Correct Order #",$.id]}),t.jsx("p",{className:"text-sm text-slate-500",children:"Only whole cartons are allowed. Reserved pairs update automatically when you save."})]}),t.jsx("div",{className:"space-y-3",children:R.map((e,r)=>{const a=F.get(String(e.finished_good_id)),s=Number((a==null?void 0:a.inner_boxes_per_outer_box)||0),i=Number(e.carton_qty||0)*s;return t.jsxs("div",{className:"grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_0.7fr_1fr_auto]",children:[t.jsx(ae,{options:f.filter(n=>Number(n.inner_boxes_per_outer_box)>0).map(n=>({value:String(n.id),label:`${n.article_code||n.name} · ${n.color||"No color"}`})),value:a?{value:String(a.id),label:`${a.article_code||a.name} · ${a.color||"No color"}`}:null,onChange:n=>k(m=>m.map((l,C)=>C===r?{...l,finished_good_id:(n==null?void 0:n.value)||""}:l)),placeholder:"Select product",menuPortalTarget:document.body,menuPosition:"fixed",styles:{menuPortal:n=>({...n,zIndex:9999}),control:n=>({...n,minHeight:"42px",borderRadius:"12px"})}}),t.jsx(j,{label:"CTN",children:t.jsx(v,{type:"number",min:"1",step:"1",required:!0,value:e.carton_qty,onChange:n=>k(m=>m.map((l,C)=>C===r?{...l,carton_qty:n.target.value}:l))})}),t.jsxs("div",{className:"flex flex-col justify-end rounded-xl bg-white px-3 py-2 text-sm",children:[t.jsx("span",{className:"text-xs text-slate-400",children:"Reserved pairs"}),t.jsx("strong",{children:s>0?w(i):"Set CTN config"})]}),t.jsx("div",{className:"flex items-end",children:t.jsx(h,{type:"button",variant:"danger",size:"sm",disabled:R.length===1,onClick:()=>k(n=>n.filter((m,l)=>l!==r)),children:"Remove"})})]},`${e.finished_good_id}-${r}`)})}),t.jsx(h,{type:"button",variant:"secondary",icon:"plus",onClick:()=>k(e=>[...e,{finished_good_id:"",carton_qty:1}]),children:"Add product"}),t.jsx(j,{label:"Correction reason",children:t.jsx(v,{required:!0,value:U,onChange:e=>M(e.target.value),placeholder:"Explain why this order is being changed"})}),t.jsxs("div",{className:"flex justify-end gap-2",children:[t.jsx(h,{type:"button",variant:"secondary",disabled:L,onClick:()=>O(null),children:"Cancel"}),t.jsx(h,{type:"submit",disabled:L||!R.length,children:L?"Saving...":"Save correction"})]})]})}):null]})}export{Je as default};
