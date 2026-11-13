// Rasterizador Gouraud con z-buffer. Colores por vértice para cara frontal y trasera.
#include <math.h>
void raster(int W, int H, int nv, const float* sx, const float* sy, const float* sz,
            const float* cf, const float* cb, int nf, const unsigned* F, float* img, float* zb){
  for(int t=0;t<nf;t++){
    unsigned a=F[3*t],b=F[3*t+1],c=F[3*t+2];
    float x0=sx[a],y0=sy[a],x1=sx[b],y1=sy[b],x2=sx[c],y2=sy[c];
    float area=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0); if(fabsf(area)<1e-9f) continue;
    const float* col = area<0 ? cf : cb;   // orientación en pantalla => cara visible
    int minx=(int)floorf(fminf(x0,fminf(x1,x2))), maxx=(int)ceilf(fmaxf(x0,fmaxf(x1,x2)));
    int miny=(int)floorf(fminf(y0,fminf(y1,y2))), maxy=(int)ceilf(fmaxf(y0,fmaxf(y1,y2)));
    if(minx<0)minx=0; if(miny<0)miny=0; if(maxx>W-1)maxx=W-1; if(maxy>H-1)maxy=H-1;
    for(int y=miny;y<=maxy;y++) for(int x=minx;x<=maxx;x++){
      float px=x+0.5f,py=y+0.5f;
      float w0=((x1-px)*(y2-py)-(x2-px)*(y1-py))/area;
      float w1=((x2-px)*(y0-py)-(x0-px)*(y2-py))/area;
      float w2=1-w0-w1;
      if(w0<-1e-5f||w1<-1e-5f||w2<-1e-5f) continue;
      float z=w0*sz[a]+w1*sz[b]+w2*sz[c];
      int i=y*W+x; if(z>=zb[i]) continue; zb[i]=z;
      for(int k=0;k<3;k++) img[3*i+k]=w0*col[3*a+k]+w1*col[3*b+k]+w2*col[3*c+k];
    }
  }
}
