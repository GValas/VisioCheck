import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { environment } from '../environments/environment';
import { VisionService } from './vision.service';
import { AuthService } from './auth.service';

@Component({
  selector: 'vc-root',
  standalone: true,
  imports: [NgClass, DatePipe, DecimalPipe],
  template: `
    <header>
      <h1>VisioCheck</h1>
      <input
        class="cam-name"
        [value]="cameraLabel()"
        (input)="cameraLabel.set($any($event.target).value)"
        placeholder="Nom de la caméra"
        aria-label="Nom de la caméra"
      />
      <span
        class="status"
        [ngClass]="vision.demo() ? 'demo' : vision.connected() ? 'on' : 'off'"
      >
        {{ vision.demo() ? 'démo' : vision.connected() ? 'connecté' : 'déconnecté' }}
      </span>
      @if (vision.lastInferMs() > 0) {
        <span class="metric">détection {{ vision.lastInferMs() | number: '1.0-0' }} ms</span>
      }
      @if (vision.dropped() > 0) {
        <span class="metric">{{ vision.dropped() }} frames sautées</span>
      }
      @if (auth.user()) {
        <span class="metric">{{ auth.user() }}</span>
        <button class="ghost" (click)="logout()">Déconnexion</button>
      }
      <button (click)="toggle()">{{ running() ? 'Arrêter' : 'Démarrer' }}</button>
    </header>

    @if (showLogin()) {
      <div class="login-overlay">
        <form class="login-card" (submit)="submitLogin($event)">
          <h2>Connexion</h2>
          <input
            [value]="loginUser()"
            (input)="loginUser.set($any($event.target).value)"
            placeholder="Identifiant"
            autocomplete="username"
          />
          <input
            type="password"
            [value]="loginPass()"
            (input)="loginPass.set($any($event.target).value)"
            placeholder="Mot de passe"
            autocomplete="current-password"
          />
          @if (loginError()) {
            <p class="login-error">{{ loginError() }}</p>
          }
          <button type="submit" [disabled]="submitting()">
            {{ submitting() ? 'Connexion…' : 'Se connecter' }}
          </button>
        </form>
      </div>
    }

    <main>
      <section class="stage">
        <video #video autoplay playsinline muted></video>
        <canvas #overlay></canvas>
        @if (errorMsg()) {
          <div class="error">{{ errorMsg() }}</div>
        }
      </section>

      <aside class="feed">
        <h2>Événements & description</h2>
        @for (item of vision.feed(); track item.id) {
          <article [ngClass]="item.kind">
            <div class="meta">
              <span class="tag">{{ item.label }}</span>
              <time>{{ item.atMs | date: 'HH:mm:ss' }}</time>
            </div>
            <p>{{ item.text }}</p>
          </article>
        } @empty {
          <p class="empty">En attente d'activité…</p>
        }
      </aside>
    </main>
  `,
  styles: [
    `
      :host { display: block; font-family: system-ui, sans-serif; color: #e6e6e6; background: #14171c; min-height: 100vh; }
      header { display: flex; align-items: center; gap: 1rem; padding: .75rem 1.25rem; background: #1c2128; border-bottom: 1px solid #2b323c; }
      h1 { font-size: 1.15rem; margin: 0; }
      .status { font-size: .8rem; padding: .15rem .5rem; border-radius: 999px; }
      .status.on { background: #15391f; color: #5ad17f; }
      .status.off { background: #3a1f1f; color: #e08a8a; }
      .status.demo { background: #3a341f; color: #e0c85a; }
      .metric { font-size: .8rem; color: #8b97a7; }
      .cam-name { background: #232a33; border: 1px solid #2b323c; color: #e6e6e6; border-radius: 6px; padding: .35rem .6rem; font-size: .85rem; width: 160px; }
      header button.ghost { margin-left: 0; background: transparent; border: 1px solid #2b323c; color: #b8c2cf; }
      .login-overlay { position: fixed; inset: 0; background: rgba(10,12,16,.8); display: flex; align-items: center; justify-content: center; z-index: 10; }
      .login-card { background: #1c2128; border: 1px solid #2b323c; border-radius: 10px; padding: 1.5rem; width: 300px; display: flex; flex-direction: column; gap: .75rem; }
      .login-card h2 { margin: 0 0 .25rem; font-size: 1.05rem; }
      .login-card input { background: #232a33; border: 1px solid #2b323c; color: #e6e6e6; border-radius: 6px; padding: .55rem .7rem; font-size: .9rem; }
      .login-card button { background: #2f7de1; color: #fff; border: 0; padding: .55rem; border-radius: 6px; cursor: pointer; }
      .login-card button:disabled { opacity: .6; cursor: default; }
      .login-error { color: #e08a8a; font-size: .82rem; margin: 0; }
      header button { margin-left: auto; background: #2f7de1; color: #fff; border: 0; padding: .45rem 1rem; border-radius: 6px; cursor: pointer; }
      main { display: grid; grid-template-columns: 1fr 340px; gap: 1rem; padding: 1rem 1.25rem; }
      .stage { position: relative; background: #000; border-radius: 8px; overflow: hidden; aspect-ratio: 16/9; }
      video, canvas { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
      .error { position: absolute; inset: auto 0 0 0; padding: .5rem; background: #5a1f1f; font-size: .85rem; }
      .feed { background: #1c2128; border-radius: 8px; padding: .75rem; max-height: 80vh; overflow-y: auto; }
      .feed h2 { font-size: .95rem; margin: .25rem 0 .75rem; }
      article { border-left: 3px solid #2f7de1; padding: .4rem .6rem; margin-bottom: .5rem; background: #232a33; border-radius: 4px; }
      article.event { border-left-color: #e0a73a; }
      article p { margin: .25rem 0 0; font-size: .9rem; }
      .meta { display: flex; justify-content: space-between; font-size: .72rem; color: #8b97a7; }
      .tag { font-weight: 600; }
      .empty { color: #8b97a7; font-size: .85rem; }
    `,
  ],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  readonly vision = inject(VisionService);
  readonly auth = inject(AuthService);

  readonly showLogin = signal(false);
  readonly loginUser = signal('');
  readonly loginPass = signal('');
  readonly loginError = signal('');
  readonly submitting = signal(false);

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly overlay = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  readonly running = signal(false);
  readonly errorMsg = signal('');
  readonly cameraLabel = signal(localStorage.getItem('vc-camera-label') ?? 'Caméra 1');

  // Identifiant logique stable de la caméra (persisté entre sessions).
  private readonly cameraId = this.resolveCameraId();
  private stream?: MediaStream;
  private captureTimer?: number;
  private frameId = 0;
  private readonly sendCanvas = document.createElement('canvas');

  private resolveCameraId(): string {
    let id = localStorage.getItem('vc-camera-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('vc-camera-id', id);
    }
    return id;
  }

  constructor() {
    // Redessine l'overlay dès qu'une nouvelle analyse arrive.
    effect(() => {
      const dets = this.vision.detections();
      this.drawOverlay(dets);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    localStorage.setItem('vc-camera-label', this.cameraLabel());
    await this.auth.checkStatus();
    if (this.auth.authRequired() && !this.auth.token) {
      this.showLogin.set(true);
      return;
    }
    this.startConnection();
  }

  private startConnection(): void {
    this.vision.connect({ cameraId: this.cameraId, label: this.cameraLabel() });
  }

  async submitLogin(event: Event): Promise<void> {
    event.preventDefault();
    this.loginError.set('');
    this.submitting.set(true);
    try {
      await this.auth.login(this.loginUser(), this.loginPass());
      this.showLogin.set(false);
      this.startConnection();
    } catch (err) {
      this.loginError.set((err as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  logout(): void {
    this.vision.disconnect();
    this.auth.logout();
    this.showLogin.set(true);
  }

  ngOnDestroy(): void {
    this.stop();
    this.vision.disconnect();
  }

  async toggle(): Promise<void> {
    if (this.running()) {
      this.stop();
    } else {
      await this.start();
    }
  }

  private async start(): Promise<void> {
    this.errorMsg.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const video = this.video().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.running.set(true);

      if (this.vision.transport === 'webrtc') {
        // Le flux média part directement via WebRTC ; pas d'envoi de frames.
        await this.vision.startWebrtc(this.stream);
      } else {
        const intervalMs = 1000 / environment.targetFps;
        this.captureTimer = window.setInterval(() => this.captureAndSend(), intervalMs);
      }
    } catch (err) {
      this.errorMsg.set('Accès webcam refusé ou indisponible : ' + (err as Error).message);
    }
  }

  private stop(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = undefined;
    }
    this.vision.stopWebrtc();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.running.set(false);
  }

  private captureAndSend(): void {
    const video = this.video().nativeElement;
    if (!video.videoWidth) {
      return;
    }
    const w = environment.sendWidth;
    const h = Math.round((video.videoHeight / video.videoWidth) * w);
    this.sendCanvas.width = w;
    this.sendCanvas.height = h;
    const ctx = this.sendCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    this.sendCanvas.toBlob(
      (blob) => {
        if (!blob) {
          return;
        }
        blob.arrayBuffer().then((buf) =>
          this.vision.sendFrame(buf, { frameId: ++this.frameId, width: w, height: h }),
        );
      },
      'image/jpeg',
      environment.jpegQuality,
    );
  }

  private drawOverlay(dets: ReturnType<VisionService['detections']>): void {
    const canvas = this.overlay().nativeElement;
    const video = this.video().nativeElement;
    if (!video.videoWidth) {
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = Math.max(2, canvas.width / 320);
    ctx.font = `${Math.max(12, canvas.width / 45)}px system-ui, sans-serif`;
    for (const d of dets) {
      const x = d.box.x * canvas.width;
      const y = d.box.y * canvas.height;
      const w = d.box.w * canvas.width;
      const h = d.box.h * canvas.height;
      ctx.strokeStyle = '#2f7de1';
      ctx.strokeRect(x, y, w, h);
      const text = `${d.label} #${d.trackId}`;
      const tw = ctx.measureText(text).width + 8;
      ctx.fillStyle = '#2f7de1';
      ctx.fillRect(x, Math.max(0, y - 20), tw, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 4, Math.max(14, y - 5));
    }
  }
}
