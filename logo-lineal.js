(function () {
  async function convertirLogoLineal(source, color = [154, 113, 53]) {
    const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
    if (!w0 || !h0) throw new Error('El logo todavía no está listo.');
    const escala = Math.min(1, 900 / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * escala)), h = Math.max(1, Math.round(h0 * escala));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const im = ctx.getImageData(0, 0, w, h), d = im.data, total = w * h;
    const corners = [0, (w-1)*4, (h-1)*w*4, (total-1)*4], bg = [0,0,0]; let count=0;
    for (const p of corners) if (d[p+3]>32) { bg[0]+=d[p]; bg[1]+=d[p+1]; bg[2]+=d[p+2]; count++; }
    if (count) for(let c=0;c<3;c++) bg[c]/=count;
    const seen=new Uint8Array(total), q=new Int32Array(total); let head=0,tail=0;
    const add=n=>{if(n<0||n>=total||seen[n])return;const p=n*4;if(d[p+3]<16){seen[n]=1;return;}
      if(Math.hypot(d[p]-bg[0],d[p+1]-bg[1],d[p+2]-bg[2])>48)return;seen[n]=1;q[tail++]=n;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);} for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    while(head<tail){const n=q[head++],x=n%w,y=(n/w)|0;d[n*4+3]=0;if(x)add(n-1);if(x+1<w)add(n+1);if(y)add(n-w);if(y+1<h)add(n+w);}
    const l=new Float32Array(total);
    for(let i=0;i<total;i++)l[i]=d[i*4]*.2126+d[i*4+1]*.7152+d[i*4+2]*.0722;
    const out=ctx.createImageData(w,h);
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const n=y*w+x;if(!d[n*4+3])continue;
      const gx=-l[n-w-1]+l[n-w+1]-2*l[n-1]+2*l[n+1]-l[n+w-1]+l[n+w+1];
      const gy=-l[n-w-1]-2*l[n-w]-l[n-w+1]+l[n+w-1]+2*l[n+w]+l[n+w+1];
      const edge=Math.hypot(gx,gy);if(edge<72)continue;const p=n*4;
      out.data[p]=color[0];out.data[p+1]=color[1];out.data[p+2]=color[2];out.data[p+3]=Math.min(255,Math.round((edge-48)*.72));}
    ctx.putImageData(out,0,0);
    return canvas.toDataURL('image/png');
  }
  window.veloxConvertirLogoLineal = convertirLogoLineal;
})();