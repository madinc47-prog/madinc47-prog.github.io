#!/usr/bin/env python3
"""Bank E for the DJ Psycho Fingers pack — all synthesized from scratch (numpy), no recordings. 22 Oct 2026."""
import numpy as np, subprocess, wave, os, sys
SR=44100; rng=np.random.default_rng(7); OUT=sys.argv[1]
def t(d): return np.arange(int(SR*d))/SR
def env(n,a=0.005,r=0.05):
    e=np.ones(n); na=max(1,int(a*SR)); nr=max(1,int(r*SR)); e[:na]=np.linspace(0,1,na); e[-nr:]*=np.linspace(1,0,nr); return e
def osc(freq, shape="saw"):
    ph=np.cumsum(freq)/SR; x=ph%1
    if shape=="sq": return np.sign(np.sin(2*np.pi*ph))*0.6+np.sin(2*np.pi*ph)*0.4
    if shape=="saw": return 2*x-1
    return np.sin(2*np.pi*ph)
def lp(x,fc):
    from scipy.signal import lfilter; a=np.exp(-2*np.pi*fc/SR); return lfilter([1-a],[1,-a],x)
def _lp_old(x,fc):
    a=np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.
    for i,v in enumerate(x): s=(1-a)*v+a*s; y[i]=s
    return y
def hp(x,fc): return x-lp(x,fc)
def verb(x,mix=0.25,dec=1.2):
    n=int(SR*dec); ir=rng.standard_normal(n)*np.exp(-np.linspace(0,7,n)); ir=lp(ir,5000); ir/=np.abs(ir).sum()/6
    from scipy.signal import fftconvolve; w=np.concatenate([fftconvolve(x,ir),[0]])[:len(x)+n]; d=np.concatenate([x,np.zeros(n)]); return d*(1-mix)+w*mix
def echo(x,dt,fb,n=4):
    d=int(dt*SR); y=np.concatenate([x,np.zeros(d*n)])
    for k in range(1,n+1): y[k*d:k*d+len(x)]+=x*(fb**k)
    return y
def shot(dur=0.6):
    n=int(SR*dur); tt=np.arange(n)/SR
    crack=hp(rng.standard_normal(n),900)*np.exp(-tt*55)
    body=lp(rng.standard_normal(n),1800)*np.exp(-tt*14)*0.8
    thump=np.sin(2*np.pi*(55+90*np.exp(-tt*30))*tt)*np.exp(-tt*16)*1.2
    return np.tanh(2.5*(crack+body+thump))
def click(f=2600,d=0.03):
    tt=t(d); return (hp(rng.standard_normal(len(tt)),1500)*0.6+np.sin(2*np.pi*f*tt))*np.exp(-tt*160)
def place(base,x,at):
    i=int(at*SR); need=i+len(x)
    if need>len(base): base=np.concatenate([base,np.zeros(need-len(base))])
    base[i:i+len(x)]+=x; return base
S={}
# US police wail: slow up/down sweep
tt=t(3.2); f=1000+450*np.sin(2*np.pi*tt/3.2-np.pi/2); S["e02-police-wail"]=("Police siren (wail)",verb(osc(f,"sq")*env(len(tt),0.05,0.3)*0.7,0.18,0.8))
tt=t(2.4); f=1050+400*np.sign(np.sin(2*np.pi*tt*3.3))*np.abs(np.sin(2*np.pi*tt*3.3))**0.5; S["e03-police-yelp"]=("Police siren (yelp)",verb(osc(lp(f,30),"sq")*env(len(tt),0.02,0.2)*0.7,0.18,0.8))
tt=t(3.0); f=np.where((tt*2).astype(int)%2==0,440.,587.); S["e04-euro-two-tone"]=("European two-tone siren",verb(osc(lp(f,60),"sq")*env(len(tt),0.02,0.15)*0.7,0.2,0.9))
S["e05-gunshot-single"]=("Gunshot (single)",verb(shot(),0.3,1.4))
b=np.zeros(1)
for k in range(6): b=place(b,shot(0.35)*(0.85+0.15*rng.random()),k*0.085)
S["e06-gunshot-burst"]=("Gunshot (rapid burst)",verb(b,0.3,1.4))
g=np.zeros(1)
for k,at in enumerate([0,0.18,0.36]): g=place(g,shot(0.5),at)
S["e07-gun-finger"]=("Gun finger 'pull up' shots",verb(echo(g,0.375,0.45,4),0.3,1.6))
r=np.zeros(1); r=place(r,click(1900,0.04),0); r=place(r,lp(rng.standard_normal(int(SR*0.09)),3000)*np.exp(-t(0.09)*30)*0.4,0.05); r=place(r,click(3100,0.035)*1.2,0.2)
S["e08-reload-cock"]=("Reload / cock",verb(r,0.12,0.5))
tt=t(1.1); oh=np.zeros(len(tt))
for fr in [130.8,196,261.6,311.1,392,523.3]: oh+=osc(np.full(len(tt),fr)*(1+0.003*rng.standard_normal()),"saw")
oh=lp(oh*np.exp(-tt*4.5),3500)+np.sin(2*np.pi*65.4*tt)*np.exp(-tt*6)*2+hp(rng.standard_normal(len(tt)),2000)*np.exp(-tt*40)*0.8
S["e09-orchestra-hit"]=("Orchestra hit",verb(np.tanh(oh*0.5),0.3,1.5))
tt=t(3.5); nz=rng.standard_normal(len(tt)); cr=hp(lp(nz,2500),300)
am=lp(rng.standard_normal(len(tt)),6)*8+1; am=np.clip(am,0.3,3)
whist=np.zeros(len(tt))
for k in range(4):
    st=rng.uniform(0.3,2.4); d=rng.uniform(0.3,0.7); idx=(tt>st)&(tt<st+d); fr=np.full(len(tt),2200.)+800*np.clip((tt-st)/d,0,1)*rng.choice([-1,1])
    whist+=np.sin(2*np.pi*np.cumsum(fr)/SR)*idx*0.25
S["e10-crowd-cheer"]=("Crowd cheer",verb((cr*am+whist)*env(len(tt),0.25,1.0),0.35,1.2))
tt=t(1.4); rate=np.clip(1-tt/1.2,0,1)**1.6; ch=np.zeros(len(tt))
for fr in [220,277.2,329.6,440]: ch+=osc(fr*rate,"saw")
S["e11-record-stop"]=("Record stop",lp(ch,3000)*env(len(tt),0.003,0.1)*0.6)
os.makedirs(OUT,exist_ok=True)
for k,(name,x) in S.items():
    x=x-np.mean(x); x=x/np.max(np.abs(x))*0.89
    nz=np.where(np.abs(x)>0.001)[0]; x=x[:nz[-1]+1]
    tmp=f"/tmp/{k}.wav"; w=wave.open(tmp,"wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype(np.int16).tobytes()); w.close()
    subprocess.run(["ffmpeg","-loglevel","error","-y","-i",tmp,"-ac","1","-c:a","libmp3lame","-q:a","5",f"{OUT}/{k}.mp3"],check=True)
    print(k,name,round(len(x)/SR,2))
