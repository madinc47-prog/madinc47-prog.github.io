import numpy as np, subprocess, json
R=44100
def t(d): return np.arange(int(R*d))/R
def env(x,a=0.005,r=0.1):
    n=len(x);e=np.ones(n);na=int(a*R);nr=min(int(r*R),n-na)
    e[:na]=np.linspace(0,1,na); e[n-nr:]*=np.linspace(1,0,nr); return x*e
def saw(f,tt): ph=np.cumsum(np.broadcast_to(f,tt.shape))/R; return 2*(ph%1)-1
def sq(f,tt): ph=np.cumsum(np.broadcast_to(f,tt.shape))/R; return np.sign(np.sin(2*np.pi*ph))
def sin(f,tt): ph=np.cumsum(np.broadcast_to(f,tt.shape))/R; return np.sin(2*np.pi*ph)
rng=np.random.default_rng(7)
def noise(d): return rng.uniform(-1,1,int(R*d))
def lp(x,c):
    a=np.exp(-2*np.pi*np.asarray(c)/R)*np.ones(len(x)); y=np.zeros_like(x); s=0
    for i in range(len(x)): s=(1-a[i])*x[i]+a[i]*s; y[i]=s
    return y
def horn(d,f=440,pitchdrop=0):
    tt=t(d); fr=f*(1+0.006*np.sin(2*np.pi*6*tt))-pitchdrop*tt/d*f
    x=sum(saw(fr*k,tt) for k in (1,1.005,0.995,1.5))/4
    return env(np.tanh(2*lp(x,3000)),0.01,0.08)
def seq(*parts,gap=0.04):
    out=[]; 
    for p in parts: out+=[p,np.zeros(int(gap*R))]
    return np.concatenate(out)
def siren(d,lo,hi,rate):
    tt=t(d); f=lo+(hi-lo)*(0.5+0.5*np.sin(2*np.pi*rate*tt)); return env(0.6*sq(f,tt)*0.5+0.5*sin(f,tt),0.01,0.1)
def sweep(d,f0,f1,kind=sin): tt=t(d); f=f0*(f1/f0)**(tt/d); return env(kind(f,tt),0.002,0.05)
def riser(d):
    tt=t(d); n=noise(d); x=lp(n,300+6000*(tt/d)**2)*(tt/d)+0.3*sweep(d,200,2000,saw)*(tt/d); return env(x,0.01,0.02)
def impact(d=1.6):
    tt=t(d); b=sin(55*np.exp(-tt*3)+30,tt)*np.exp(-tt*2.5); n=lp(noise(d),1500)*np.exp(-tt*8); return np.tanh(1.5*(b+n))
def whoosh(d,up=True):
    tt=t(d); c=200+5000*((tt/d) if up else (1-tt/d)); e=np.sin(np.pi*tt/d)**2; return lp(noise(d),c)*e*3
def laser(n=1,d=0.25):
    return seq(*[sweep(d,3000,150,sq)*0.6 for _ in range(n)],gap=0.03)
def stab(f=220,d=0.5):
    tt=t(d); x=sum(saw(f*k,tt) for k in (1,1.26,1.5,2))/4; return env(lp(x,2500)*np.exp(-tt*5),0.003,0.05)
def rewind(d=1.2):
    tt=t(d); f=900*(1-0.8*tt/d)+300*np.sin(2*np.pi*14*tt); x=lp(saw(np.abs(f)+50,tt),2500)+0.3*lp(noise(d),3000); return env(x,0.01,0.1)
def gate(d=1.5,f=880):
    tt=t(d); return env(saw(f,tt)*(np.sin(2*np.pi*8*tt)>0)*lp(np.ones(len(tt)),1),0.005,0.1)*0.7
def reverse(x): return x[::-1].copy()
A=[("Air Horn",horn(1.2)),("Air Horn x3",seq(horn(0.22),horn(0.22),horn(0.6))),("Air Horn High",horn(1.0,660)),("Horn Drop",horn(1.4,520,0.5)),
 ("Siren Up-Down",siren(2.0,500,1400,1.2)),("Siren Fast",siren(1.6,600,1300,5)),("Laser",laser(1)),("Laser x4",laser(4,0.12)),
 ("Riser 2s",riser(2.0)),("Big Impact",impact()),("Rewind FX",rewind()),("Whoosh Up",whoosh(1.0,True)),
 ("Whoosh Down",whoosh(1.0,False)),("Synth Stab",stab()),("Gated Buzz",gate()),("Reverse Crash",reverse(lp(noise(1.5),8000)*np.exp(-t(1.5)*3)))]
C={6:("Brass Hit",stab(330,0.6)),7:("Zap Up",sweep(0.35,200,3000,sq)*0.6),8:("Chirp FX",seq(sweep(0.08,800,2500,saw),sweep(0.08,2500,800,saw),gap=0.02)*0.7),12:("Reverse Riser",reverse(impact(1.2))*0.8)}
def wr(name,x):
    x=np.asarray(x,np.float64); x=x-np.mean(x); x=x/max(1e-9,np.abs(x).max())*0.89
    subprocess.run(['ffmpeg','-y','-v','error','-f','f64le','-ar',str(R),'-ac','1','-i','-','-codec:a','libmp3lame','-b:a','160k',name],input=x.tobytes(),check=True)
    return round(len(x)/R,2)
out={"A":[],"C":{}}
for i,(n,x) in enumerate(A):
    f="a%02d-fx-%s.mp3"%(i+1,n.lower().replace(' ','-').replace('x','x')); out["A"].append((i,f,n,wr(f,x)))
for p,(n,x) in C.items():
    f="c%02d-fx-%s.mp3"%(p+1,n.lower().replace(' ','-')); out["C"][p]=(f,n,wr(f,x))
json.dump(out,open('out.json','w'),indent=1)
