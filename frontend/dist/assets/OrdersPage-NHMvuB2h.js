import{r as o,u as He,a as Ye,k as Qe,d as v,j as t,f as w,B as u,l as xe,m as ye,n as Ze}from"./index-CdoiL8Ab.js";import{D as Je}from"./DataTable-wYDLutOy.js";import{F as _,T as f,S as Xe,a as et}from"./Field-BOjoO2rf.js";import{S as ve}from"./SectionCard-CFF2uPIk.js";import{S as se}from"./StatCard-CbPsx9Bu.js";import{S as tt}from"./StatusBadge-F1LBb-dW.js";import{u as at,a as R}from"./useDataRefresh-lxhhkRBT.js";import{S as fe}from"./react-select.esm-GR95CUD5.js";import{S as rt}from"./search-OKI-4YgV.js";import"./EmptyState-sH0K_Zn-.js";import"./index-8JwjhRSi.js";const Ne={customer_name:"",customer_phone:"",customer_address:"",pan_number:"",transport_name:"",notes:"",items:[{finished_good_id:"",qty_ordered:1}]},st={PENDING:"warning",CONFIRMED:"info",PACKED:"neutral",DELIVERED:"success",CANCELLED:"danger"},nt=["CONFIRMED","PACKED","DELIVERED"],je=[{value:"DUPLICATE_ORDER",label:"Duplicate order"},{value:"CUSTOMER_CHANGED_MIND",label:"Customer changed mind"},{value:"INCORRECT_PRODUCT_OR_QUANTITY",label:"Incorrect product or quantity"},{value:"INSUFFICIENT_STOCK",label:"Insufficient stock"},{value:"PRICING_ISSUE",label:"Pricing issue"},{value:"DELIVERY_ISSUE",label:"Delivery issue"},{value:"OTHER",label:"Other"}],Ce=N=>{var A;return((A=je.find(T=>T.value===N))==null?void 0:A.label)||"Other"},ot=new Set(["suyogya shrestha","suyogya shresth","suvarna shrestha","hirdaya shrestha"]),lt=(N={})=>String(N.role||"").toUpperCase()==="CO_ADMIN"&&ot.has(String(N.name||"").trim().replace(/\s+/g," ").toLowerCase());function ft(){const[N,A]=o.useState(""),[T,it]=o.useState(""),{token:g,user:D}=He(),{showToast:b}=Ye(),k=Qe(D==null?void 0:D.role,["ADMIN","CO_ADMIN"]),we=lt(D),[Q,De]=o.useState([]),[O,L]=o.useState(1),[$,Se]=o.useState({page:1,per_page:50,total:0,total_pages:1}),[ne,Ee]=o.useState(""),[C,ke]=o.useState([]),[oe,Oe]=o.useState([]),[m,x]=o.useState(Ne),[q,Pe]=o.useState("ALL"),[M,z]=o.useState(null),[F,S]=o.useState([]),[le,Z]=o.useState(""),[U,ie]=o.useState(!1),[B,G]=o.useState(null),[P,de]=o.useState("DUPLICATE_ORDER"),[ce,ue]=o.useState(""),[J,X]=o.useState(""),[V,me]=o.useState(!1);o.useEffect(()=>{const e=window.setTimeout(()=>{Ee(N.trim()),L(1)},300);return()=>window.clearTimeout(e)},[N]);const W=o.useCallback(async()=>{const e=await v.getOrders(g,{page:O,per_page:50,search:ne,status:q==="ALL"?void 0:q});De(e.data||[]),Se(e.pagination||{page:O,per_page:50,total:(e.data||[]).length,total_pages:1})},[ne,O,q,g]),K=o.useCallback(async()=>{const[e,a]=await Promise.all([v.getAvailability(g,{includeHidden:k}),v.getWarehouseStock(g)]);ke(e.data||[]),Oe(a.data||[])},[k,g]),E=o.useCallback(()=>Promise.all([W(),K()]),[W,K]);o.useEffect(()=>{W().catch(console.error)},[W]),o.useEffect(()=>{K().catch(console.error)},[K]),o.useEffect(()=>{O>Number($.total_pages||1)&&L(Number($.total_pages||1))},[O,$.total_pages]),at(E,"orders");const ee=o.useMemo(()=>new Map(C.map(e=>[String(e.id),e])),[C]),Ie=o.useMemo(()=>{const e=new Map;return oe.forEach(a=>{const s=String(a.finished_good_id),r=e.get(s)||[];r.push(a),e.set(s,r)}),e},[oe]),te=C.reduce((e,a)=>(e.physical+=Number(a.physical_stock||0),e.reserved+=Number(a.reserved_qty||0),e.available+=Number(a.available_qty||0),e),{physical:0,reserved:0,available:0}),he=(e,a,s)=>{x(r=>({...r,items:r.items.map((c,n)=>n===e?{...c,[a]:s}:c)}))},Re=async e=>{var a,s,r;e.preventDefault();try{const c={...m,customer_name:m.customer_name.trim(),customer_phone:m.customer_phone.trim(),customer_address:m.customer_address.trim(),pan_number:m.pan_number.trim(),transport_name:m.transport_name.trim(),notes:m.notes.trim(),items:m.items.map(n=>({finished_good_id:Number(n.finished_good_id),qty_ordered:Number(n.qty_ordered)}))};try{await v.createOrder(c,g)}catch(n){if(n.status!==409||((a=n.data)==null?void 0:a.code)!=="POTENTIAL_DUPLICATE_ORDER")throw n;const i=(r=(s=n.data)==null?void 0:s.duplicates)==null?void 0:r[0];if(!window.confirm(["Possible duplicate order detected.",i?`Order #${i.id} for ${i.customer_name} already has the same products and quantities.`:"A recent order already has the same customer, products and quantities.",i!=null&&i.created_by_name?`Created by: ${i.created_by_name}`:null,"Create another order anyway?"].filter(Boolean).join(`

`)))return;await v.createOrder({...c,confirm_duplicate:!0},g)}x(Ne),await E(),R("orders"),b({tone:"success",title:"Order reserved",message:"Available stock was refreshed."})}catch(c){b({tone:"error",title:"Order failed",message:c.message})}},H=async(e,a,s={})=>{try{return await v.updateOrderStatus(e,{status:a,...a==="CANCELLED"?s:{}},g),await E(),R("orders"),b({tone:"success",title:"Order updated",message:`Order marked ${a.toLowerCase()}.`}),!0}catch(r){return b({tone:"error",title:"Order update failed",message:r.message}),!1}},Ae=e=>{G(e),de("DUPLICATE_ORDER"),ue(""),X("")},Te=async e=>{if(e.preventDefault(),!B)return;const a=ce.trim()||Ce(P);me(!0);try{await H(B.id,"CANCELLED",{cancellation_code:P,cancellation_reason:a,...P==="DUPLICATE_ORDER"&&Number(J)>0?{duplicate_of_order_id:Number(J)}:{}})&&G(null)}finally{me(!1)}},Le=async e=>{try{const a=await v.assignOrderDeliveryNote(e.id,g);await E(),R("orders"),b({tone:"success",title:"Delivery note assigned",message:a.message||`A delivery-note number was assigned to Order #${e.id}.`})}catch(a){b({tone:"error",title:"Could not assign DN",message:a.message})}},$e=async e=>{const a=window.prompt(`Why are you reopening packing for Order #${e.id}?

The existing delivery note number will remain unchanged.`);if(a===null)return;const s=a.trim();if(!s){b({tone:"error",title:"Reason required",message:"Enter why this packed order needs to be corrected."});return}try{const r=await v.reopenOrderPacking(e.id,s,g);await E(),R("orders"),b({tone:"success",title:"Packing reopened",message:r.message||`${e.delivery_note_number||"Delivery note"} was preserved. You can now correct CTN.`})}catch(r){b({tone:"error",title:"Could not reopen packing",message:r.message})}},qe=e=>{z(e),Z(""),S((e.items||[]).map(a=>({finished_good_id:String(a.finished_good_id),carton_qty:Number(a.inner_boxes_per_outer_box)>0?Number(a.qty_ordered||0)/Number(a.inner_boxes_per_outer_box):""})))},Me=async e=>{if(e.preventDefault(),!!M){ie(!0);try{await v.correctOrderItems(M.id,{reason:le.trim(),items:F.map(a=>({finished_good_id:Number(a.finished_good_id),carton_qty:Number(a.carton_qty)}))},g),z(null),S([]),Z(""),await E(),R("orders"),b({tone:"success",title:"Order corrected",message:"Reserved stock was recalculated automatically."})}catch(a){b({tone:"error",title:"Correction failed",message:a.message})}finally{ie(!1)}}},ze=e=>t.jsx("div",{className:"space-y-1",children:e.items.map(a=>t.jsxs("p",{children:[a.product_name," - ",w(a.qty_ordered)," ",a.unit]},a.id))}),Fe=Q;o.useMemo(()=>C.filter(e=>{var s,r,c;const a=T.toLowerCase();return((s=e.name)==null?void 0:s.toLowerCase().includes(a))||((r=e.article_code)==null?void 0:r.toLowerCase().includes(a))||((c=e.color)==null?void 0:c.toLowerCase().includes(a))}),[C,T]);const pe=o.useMemo(()=>new Map(Q.filter(e=>e.delivery_note_number).map(e=>[Number(e.id),e.delivery_note_number])),[Q]),p=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"),I=e=>Number(e||0).toLocaleString(void 0,{maximumFractionDigits:2}),Ue=(e=[],a=0)=>{let s=Number(a||0);const r=[],c=[...e].filter(n=>Number(n.quantity||0)>0).sort((n,i)=>{const h=new Date(n.updated_at||0).getTime(),j=new Date(i.updated_at||0).getTime();return h!==j?h-j:Number(n.id||0)-Number(i.id||0)});for(const n of c){if(s<=0)break;const i=Number(n.quantity||0),h=Math.min(i,s);r.push({warehouse_name:n.warehouse_name,quantity:h}),s-=h}return r},Be=(e="")=>{const a=new Date,s=xe(a,{includeTime:!1}),r=ye(a),c=a.toLocaleTimeString(),n=e.delivery_note_number||pe.get(Number(e.id))||"-",i=(e.items||[]).map(l=>{const d=ee.get(String(l.finished_good_id)),ae=Number(l.qty_ordered||0),re=Number(l.inner_boxes_per_outer_box||(d==null?void 0:d.inner_boxes_per_outer_box)||0),Ve=re>0?ae/re:0,_e=l.warehouse_allocations||[],We=Ie.get(String(l.finished_good_id))||[],Ke=(_e.length?_e:Ue(We,ae)).filter(Y=>Number(Y.quantity||0)>0).map(Y=>`${Y.warehouse_name} (${I(Y.quantity)})`).join(", ")||"-";return{...l,pairs:ae,pairsPerCarton:re,cartons:Ve,finished_good_id:l.finished_good_id||(d==null?void 0:d.id)||"-",product_id:l.product_id||l.article_code||(d==null?void 0:d.article_code)||"-",product_size:l.product_size||(d==null?void 0:d.size)||"-",warehouse_name:Ke}}),h=i.reduce((l,d)=>l+d.pairs,0),j=i.reduce((l,d)=>l+d.cartons,0),Ge=i.map((l,d)=>`
          <tr>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${d+1}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${p(l.finished_good_id)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${p(l.product_id)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${p(l.product_size)}
            </td>
            <td style="border:1px solid black;padding:6px;">
              ${p(l.product_name)}
            </td>
            <td style="border:1px solid black;padding:4px;">
              ${p(l.warehouse_name)}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${l.pairsPerCarton>0?I(l.cartons):"0"}
            </td>
            <td style="border:1px solid black;padding:6px;text-align:center;">
              ${I(l.pairs)} ${p(l.unit||"pairs")}
            </td>
          </tr>
        `).join(""),y=window.open("","_blank","width=900,height=700");if(!y){b({tone:"error",title:"Print blocked",message:"Allow popups for this site and try printing again."});return}v.logOrderPrint(e.id,g).catch(()=>{}),y.document.open(),y.document.write(`
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
                Nepali Date: ${r}<br/>
                English Date: ${s}<br/>
                Time: ${c}<br/>
                <strong>Transport Name:</strong> ${p(e.transport_name||"-")}<br/>
                <strong>Gate Pass No:</strong><br/>
                <strong>Bill No:</strong><br/>
              </td>
              <td width="40%">
                <strong>Delivery Note No:</strong> ${n}<br/>
                <strong>Created By:</strong> ${p(e.created_by_name||"-")}<br/>
                <strong>Customer Name:</strong> ${p(e.customer_name)}<br/>
                <strong>Phone Number:</strong> ${p(e.customer_phone||"-")}<br/>
                <strong>Address:</strong> ${p(e.customer_address||"-")}<br/>
                <strong>PAN Number:</strong> ${p(e.pan_number||"-")}
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
              ${Ge}
            </tbody>
          </table>

          <table class="totals">
            <tr>
              <td class="label" width="81%">Total</td>
              <td class="value" width="9%">${I(j)}</td>
              <td class="value" width="10%">${I(h)} pairs</td>
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
              (${p((D==null?void 0:D.name)||"User")})
            </div>
          </div>

          <div class="page-number"></div>
        </body>
      </html>
    `),y.document.close();let ge=!1;const be=()=>{ge||y.closed||(ge=!0,y.focus(),y.print())};y.onafterprint=()=>{y.close()},y.addEventListener("load",()=>{setTimeout(be,100)},{once:!0}),setTimeout(be,700)};return t.jsxs("div",{className:"space-y-4",children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-3",children:[t.jsx(se,{label:"Physical Stock",value:w(te.physical),icon:"finishedGoods"}),t.jsx(se,{label:"Reserved Stock",value:w(te.reserved),tone:"alert",icon:"orders"}),t.jsx(se,{label:"Available Stock",value:w(te.available),tone:"calm",icon:"check"})]}),t.jsx(ve,{title:"Create order",subtitle:"Creating an order reserves available finished goods but does not reduce physical stock yet.",icon:"orders",children:t.jsxs("form",{className:"space-y-5",onSubmit:Re,children:[t.jsxs("div",{className:"grid gap-4 md:grid-cols-2 xl:grid-cols-3",children:[t.jsx(_,{label:"Customer name",children:t.jsx(f,{value:m.customer_name,onChange:e=>x(a=>({...a,customer_name:e.target.value})),required:!0})}),t.jsx(_,{label:"Customer phone",children:t.jsx(f,{type:"tel",maxLength:10,pattern:"[0-9]{10}",value:m.customer_phone,onChange:e=>{const a=e.target.value.replace(/\D/g,"").slice(0,10);x(s=>({...s,customer_phone:a}))},required:!0})}),t.jsx(_,{label:"Customer Address",children:t.jsx(f,{value:m.customer_address,onChange:e=>{const a=e.target.value.replace(/[^a-zA-Z\s]/g,"");x(s=>({...s,customer_address:a}))},required:!0})}),t.jsx(_,{label:"PAN Number",children:t.jsx(f,{type:"text",maxLength:9,pattern:"[0-9]{9}",value:m.pan_number,onChange:e=>{const a=e.target.value.replace(/\D/g,"").slice(0,9);x(s=>({...s,pan_number:a}))},required:!0})}),t.jsx(_,{label:"Transport Name",children:t.jsx(f,{value:m.transport_name,onChange:e=>x(a=>({...a,transport_name:e.target.value})),required:!0})}),t.jsx(_,{label:"Notes",children:t.jsx(f,{value:m.notes,onChange:e=>x(a=>({...a,notes:e.target.value}))})})]}),t.jsx("div",{className:"space-y-3",children:m.items.map((e,a)=>{const s=ee.get(String(e.finished_good_id));return t.jsxs("div",{className:"grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-[2fr_1fr_1fr_auto]",children:[t.jsx(fe,{options:C.map(r=>({value:String(r.id),label:`${r.name} (${r.article_code}) - available ${w(r.available_qty)} ${r.unit}`})),value:C.map(r=>({value:String(r.id),label:`${r.name} (${r.article_code}) - available ${w(r.available_qty)} ${r.unit}`})).find(r=>r.value===String(e.finished_good_id))||null,onChange:r=>he(a,"finished_good_id",(r==null?void 0:r.value)||""),placeholder:"Search finished good...",isClearable:!0,menuPortalTarget:document.body,menuPosition:"fixed",styles:{control:r=>({...r,minHeight:"44px",borderRadius:"12px",borderColor:"#d1d5db",boxShadow:"none",fontSize:"14px"}),menuPortal:r=>({...r,zIndex:9999})}}),t.jsx(f,{type:"number",min:"1",step:"1",value:e.qty_ordered,onChange:r=>he(a,"qty_ordered",r.target.value),required:!0}),t.jsxs("div",{className:"rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-600",children:["Available: ",s?`${w(s.available_qty)} ${s.unit}`:"-"]}),t.jsx(u,{type:"button",variant:"danger",disabled:m.items.length===1,onClick:()=>x(r=>({...r,items:r.items.filter((c,n)=>n!==a)})),children:"Remove"})]},a)})}),t.jsxs("div",{className:"flex flex-wrap gap-3",children:[t.jsx(u,{type:"button",variant:"secondary",icon:"plus",onClick:()=>x(e=>({...e,items:[...e.items,{finished_good_id:"",qty_ordered:1}]})),children:"Add item"}),t.jsx(u,{type:"submit",icon:"check",children:"Reserve order"})]})]})}),t.jsxs(ve,{title:"Orders",subtitle:k?"Admin can move orders through confirmation, packing, delivery, or cancellation.":"Your reserved orders.",icon:"orders",children:[t.jsxs("div",{className:"mb-1 flex flex-col items-stretch justify-between gap-3 px-1 py-2 sm:flex-row sm:items-center",children:[t.jsxs("div",{className:"relative w-full sm:w-auto",children:[t.jsx(rt,{size:16,className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"}),t.jsx("input",{type:"text",placeholder:"Search orders...",value:N,onChange:e=>A(e.target.value),className:"w-full rounded-xl border border-black bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-slate-400 focus:outline-none sm:w-auto"})]}),t.jsxs("select",{value:q,onChange:e=>{Pe(e.target.value),L(1)},className:"rounded-xl border border-black bg-white px-4 py-2.5 text-sm shadow-sm focus:border-slate-400 focus:outline-none",children:[t.jsx("option",{value:"ALL",children:"All Status"}),t.jsx("option",{value:"PENDING",children:"Pending"}),t.jsx("option",{value:"CONFIRMED",children:"Confirmed"}),t.jsx("option",{value:"PACKED",children:"Packed"}),t.jsx("option",{value:"DELIVERED",children:"Delivered"}),t.jsx("option",{value:"CANCELLED",children:"Cancelled"})]})]}),t.jsx(Je,{columns:[{key:"id",label:"Order-ID",width:"4%",align:"center"},{key:"customer_details",label:"Customer Details",width:"14%",render:e=>t.jsxs("div",{className:"min-w-0",children:[t.jsx("strong",{children:e.customer_name||"-"}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Phone: ",e.customer_phone||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Address: ",e.customer_address||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["PAN: ",e.pan_number||"-"]}),t.jsx("br",{}),t.jsxs("small",{style:{color:"#666"},children:["Transport: ",e.transport_name||"-"]})]})},{key:"items",label:"Items",width:"20%",render:ze},{key:"status",label:"Status",width:"7%",align:"center",render:e=>t.jsx(tt,{tone:st[e.status],children:e.status})},{key:"cancellation_reason",label:"Cancel Reason",width:"10%",render:e=>e.status==="CANCELLED"?t.jsxs("div",{className:"space-y-1",children:[t.jsx("strong",{children:Ce(e.cancellation_code)}),t.jsx("div",{className:"text-xs text-slate-500",children:e.cancellation_reason||"-"}),e.duplicate_of_order_id?t.jsxs("div",{className:"text-xs font-semibold text-indigo-600",children:["Original: Order #",e.duplicate_of_order_id]}):null]}):"-"},{key:"created_by_name",label:"Created By",width:"8%",align:"center"},{key:"created_at",label:"Created",width:"9%",align:"center",render:e=>t.jsxs("div",{className:"flex flex-col",children:[t.jsx("strong",{children:xe(e.created_at,{includeTime:!1})}),t.jsxs("span",{className:"text-xs text-slate-500",children:["BS ",ye(e.created_at)]}),t.jsx("span",{className:"text-xs text-slate-500",children:Ze(e.created_at)})]})},k?{key:"actions",label:"Actions",width:"9%",align:"center",render:e=>{const a=nt.includes(e.status),s=!["DELIVERED","CANCELLED"].includes(e.status);return!a&&!s?null:t.jsxs("div",{className:"grid gap-1",children:[a?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>Be(e),children:"🖨️ DN"}):null,s?t.jsxs(t.Fragment,{children:[e.status==="PENDING"?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>H(e.id,"CONFIRMED"),children:"Confirm"}):null,["PENDING","CONFIRMED"].includes(e.status)?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>H(e.id,"PACKED"),children:"Pack"}):null,t.jsx(u,{size:"sm",icon:"check",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>{window.confirm(`Are you sure you want to mark Order #${e.id} as delivered?

Customer: ${e.customer_name}
This action cannot be undone.`)&&H(e.id,"DELIVERED")},children:"Deliver"}),t.jsx(u,{size:"sm",variant:"danger",className:"h-auto min-h-9 whitespace-normal px-2 py-1.5 text-sm",onClick:()=>Ae(e),children:"Cancel"})]}):null]})}}:{key:"empty",label:"",width:"12%"},{key:"confirmed_by_name",label:"Confirmed By / DN",width:"11%",align:"center",render:e=>{const a=e.delivery_note_number||pe.get(Number(e.id))||"-";return t.jsxs("div",{className:"space-y-1",children:[e.confirmed_by_name||"-",t.jsx("br",{}),t.jsx("small",{style:{color:"#666"},children:a}),!e.delivery_note_number&&["CONFIRMED","PACKED","DELIVERED"].includes(e.status)?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>Le(e),children:"Assign DN"}):null]})}},k?{key:"order_edits",label:"Order Edits",width:"8%",align:"center",render:e=>we?e.status==="PACKED"?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>$e(e),children:"Reopen packing"}):["PENDING","CONFIRMED"].includes(e.status)?t.jsx(u,{size:"sm",variant:"secondary",className:"h-auto min-h-9 w-full whitespace-normal px-2 py-1.5 text-sm",onClick:()=>qe(e),children:"Correct CTN"}):t.jsx("span",{className:"text-slate-400",children:"Locked"}):t.jsx("span",{className:"text-slate-400",children:"-"})}:{key:"order_edits_empty",label:"",width:"8%"}],rows:Fe,showToolbar:!1,fitColumns:!0,wrapCells:!0,responsiveScroll:!0,serverPagination:{...$,onPageChange:L}})]}),B?t.jsx("div",{className:"fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm",onMouseDown:()=>!V&&G(null),children:t.jsxs("form",{onSubmit:Te,onMouseDown:e=>e.stopPropagation(),className:"w-full max-w-lg space-y-5 rounded-2xl bg-white p-6 shadow-2xl",children:[t.jsxs("div",{children:[t.jsxs("h2",{className:"text-lg font-bold text-slate-950",children:["Cancel Order #",B.id]}),t.jsx("p",{className:"text-sm text-slate-500",children:"Select the correct category so duplicate orders do not reduce product or dealer performance."})]}),t.jsx(_,{label:"Cancellation category",children:t.jsx(Xe,{value:P,onChange:e=>{de(e.target.value),e.target.value!=="DUPLICATE_ORDER"&&X("")},children:je.map(e=>t.jsx("option",{value:e.value,children:e.label},e.value))})}),P==="DUPLICATE_ORDER"?t.jsx(_,{label:"Original order number (optional)",hint:"Enter the order that should remain active. The duplicate order will link to it for audit history.",children:t.jsx(f,{type:"number",min:"1",step:"1",value:J,onChange:e=>X(e.target.value),placeholder:"For example: 351"})}):null,t.jsx(_,{label:"Additional note",hint:"Optional unless the category needs more explanation.",children:t.jsx(et,{value:ce,onChange:e=>ue(e.target.value),placeholder:"Explain what happened"})}),t.jsxs("div",{className:"flex justify-end gap-2",children:[t.jsx(u,{type:"button",variant:"secondary",disabled:V,onClick:()=>G(null),children:"Keep order"}),t.jsx(u,{type:"submit",variant:"danger",disabled:V,children:V?"Cancelling...":"Cancel order"})]})]})}):null,M?t.jsx("div",{className:"fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm",onMouseDown:()=>!U&&z(null),children:t.jsxs("form",{onSubmit:Me,onMouseDown:e=>e.stopPropagation(),className:"max-h-[90vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl",children:[t.jsxs("div",{children:[t.jsxs("h2",{className:"text-lg font-bold text-slate-950",children:["Correct Order #",M.id]}),t.jsx("p",{className:"text-sm text-slate-500",children:"Only whole cartons are allowed. Reserved pairs update automatically when you save."})]}),t.jsx("div",{className:"space-y-3",children:F.map((e,a)=>{const s=ee.get(String(e.finished_good_id)),r=Number((s==null?void 0:s.inner_boxes_per_outer_box)||0),c=Number(e.carton_qty||0)*r;return t.jsxs("div",{className:"grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[2fr_0.7fr_1fr_auto]",children:[t.jsx(fe,{options:C.filter(n=>Number(n.inner_boxes_per_outer_box)>0).map(n=>({value:String(n.id),label:`${n.article_code||n.name} · ${n.color||"No color"}`})),value:s?{value:String(s.id),label:`${s.article_code||s.name} · ${s.color||"No color"}`}:null,onChange:n=>S(i=>i.map((h,j)=>j===a?{...h,finished_good_id:(n==null?void 0:n.value)||""}:h)),placeholder:"Select product",menuPortalTarget:document.body,menuPosition:"fixed",styles:{menuPortal:n=>({...n,zIndex:9999}),control:n=>({...n,minHeight:"42px",borderRadius:"12px"})}}),t.jsx(_,{label:"CTN",children:t.jsx(f,{type:"number",min:"1",step:"1",required:!0,value:e.carton_qty,onChange:n=>S(i=>i.map((h,j)=>j===a?{...h,carton_qty:n.target.value}:h))})}),t.jsxs("div",{className:"flex flex-col justify-end rounded-xl bg-white px-3 py-2 text-sm",children:[t.jsx("span",{className:"text-xs text-slate-400",children:"Reserved pairs"}),t.jsx("strong",{children:r>0?w(c):"Set CTN config"})]}),t.jsx("div",{className:"flex items-end",children:t.jsx(u,{type:"button",variant:"danger",size:"sm",disabled:F.length===1,onClick:()=>S(n=>n.filter((i,h)=>h!==a)),children:"Remove"})})]},`${e.finished_good_id}-${a}`)})}),t.jsx(u,{type:"button",variant:"secondary",icon:"plus",onClick:()=>S(e=>[...e,{finished_good_id:"",carton_qty:1}]),children:"Add product"}),t.jsx(_,{label:"Correction reason",children:t.jsx(f,{required:!0,value:le,onChange:e=>Z(e.target.value),placeholder:"Explain why this order is being changed"})}),t.jsxs("div",{className:"flex justify-end gap-2",children:[t.jsx(u,{type:"button",variant:"secondary",disabled:U,onClick:()=>z(null),children:"Cancel"}),t.jsx(u,{type:"submit",disabled:U||!F.length,children:U?"Saving...":"Save correction"})]})]})}):null]})}export{ft as default};
