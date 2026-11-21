// Push: reine Hilfsfunktionen (ohne Browser-APIs), damit sie testbar sind

export type PushAdvice = 'ok' | 'ios-install' | 'ios-old' | 'unsupported' | 'denied';

export interface Platform {
  ios: boolean;            // iPhone/iPad
  iosVersion: number | null;
  standalone: boolean;     // als Home-Bildschirm-App geöffnet
  supported: boolean;      // PushManager + Service Worker + Notification vorhanden
  permission: 'default' | 'granted' | 'denied';
}

/** Was kann dieses Gerät? iPhone: nur als installierte App ab iOS 16.4. */
export function pushAdvice(p: Platform): PushAdvice {
  if (p.ios) {
    if (p.iosVersion !== null && p.iosVersion < 16.4) return 'ios-old';
    if (!p.standalone) return 'ios-install';
  }
  if (!p.supported) return 'unsupported';
  if (p.permission === 'denied') return 'denied';
  return 'ok';
}

/** iOS-Version aus dem User-Agent (z.B. "OS 17_2 like Mac OS X" -> 17.2), sonst null */
export function iosVersionFromUa(ua: string): number | null {
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  return /iPhone|iPad|iPod/.test(ua) && m ? Number(m[1]) + Number(m[2]) / 10 : null;
}

/** Öffentlicher VAPID-Schlüssel (base64url) -> Bytes für pushManager.subscribe */
export function urlB64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export interface PushPrefs { challenge: boolean; decided: boolean; expiring: boolean; streak: boolean; quiet_start: number; quiet_end: number }
export const DEFAULT_PUSH_PREFS: PushPrefs = { challenge: true, decided: true, expiring: true, streak: true, quiet_start: 21, quiet_end: 8 };

/** Liegt die Stunde (deutsche Zeit) in der Ruhezeit? Gleiche Logik wie push_quiet_until in supabase/006_push.sql */
export function inQuiet(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
