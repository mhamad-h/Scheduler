// Minimal client for LAU's Banner 8 "Dynamic Schedule" (class search) pages.
// Request sequence mirrors what a browser does: landing page -> pick term -> search one subject.

export const BASE = 'https://banweb.lau.edu.lb/prod';
const UA = 'Mozilla/5.0 (compatible; LAU-Scheduler/1.0; course schedule viewer)';

export class BannerClient {
  private cookies = new Map<string, string>();

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private async request(path: string, body?: string, referer?: string, attempt = 1): Promise<string> {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (referer) headers['Referer'] = referer;
    if (this.cookies.size) headers['Cookie'] = this.cookieHeader();
    try {
      const res = await fetch(`${BASE}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(90_000),
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      const buf = await res.arrayBuffer();
      const charset = res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? 'utf-8';
      let dec: TextDecoder;
      try {
        dec = new TextDecoder(charset);
      } catch {
        dec = new TextDecoder('utf-8');
      }
      return dec.decode(buf);
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return this.request(path, body, referer, attempt + 1);
    }
  }

  landing() {
    return this.request('bwckschd.p_disp_dyn_sched');
  }

  selectTerm(term: string) {
    return this.request(
      'bwckgens.p_proc_term_date',
      `p_calling_proc=bwckschd.p_disp_dyn_sched&p_term=${encodeURIComponent(term)}`,
      `${BASE}/bwckschd.p_disp_dyn_sched`,
    );
  }

  searchSubject(term: string, subj: string) {
    const p = new URLSearchParams();
    p.append('term_in', term);
    for (const k of ['sel_subj', 'sel_day', 'sel_schd', 'sel_insm', 'sel_camp', 'sel_levl', 'sel_sess', 'sel_instr', 'sel_ptrm', 'sel_attr'])
      p.append(k, 'dummy');
    p.append('sel_subj', subj);
    const rest: [string, string][] = [
      ['sel_crse', ''], ['sel_title', ''], ['sel_schd', '%'], ['sel_insm', '%'], ['sel_from_cred', ''], ['sel_to_cred', ''],
      ['sel_camp', '%'], ['sel_levl', '%'], ['sel_ptrm', '%'], ['sel_instr', '%'], ['sel_sess', '%'], ['sel_attr', '%'],
      ['begin_hh', '0'], ['begin_mi', '0'], ['begin_ap', 'a'], ['end_hh', '0'], ['end_mi', '0'], ['end_ap', 'a'],
    ];
    for (const [k, v] of rest) p.append(k, v);
    return this.request('bwckschd.p_get_crse_unsec', p.toString(), `${BASE}/bwckgens.p_proc_term_date`);
  }
}
