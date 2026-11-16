# LAU Scheduler

**Live site: https://mhamad-h.github.io/Scheduler/**

A fast, good-looking class scheduler for Lebanese American University. Add the courses you need, set filters, and it finds every conflict-free combination of sections and ranks them. Save the best ones in slots and copy their CRNs straight into Banner.

## Features

- **Instant course search.** Typing `MTH2` lists MTH 201, 206, 207…; titles work too (`calculus`). <kbd>Tab</kbd> completes, <kbd>Enter</kbd> adds.
- **Lectures and labs together.** Courses like PHY 111 that have Lecture and Lab sections under one code get one section of each. A component can be switched off.
- **Filters**
  - campus (sections from different campuses are never mixed unless you allow it)
  - days off and max days on campus
  - earliest start and latest end
  - drag-to-paint blocked times
  - avoid or prefer professors
  - lock or exclude individual CRNs
  - optional courses that are dropped only if they don't fit
- **Rankings:** Balanced, Fewest days, Least idle time, Consistent times, Late starts, Early finish, Preferred profs, plus a **Custom** mode with sliders. Switching ranking is instant.
- **Calendar view.**
  - Click any class to swap its section for another one that fits.
  - Shows final exam and one-off dates, and warns when two exams clash.
- **Saved slots (A, B, C…).** Rename, reorder, swap sections, copy one slot's CRNs or all of them (space, comma or newline separated), and share a link.
- **Fast.** The solver runs in a Web Worker and checks conflicts with bitsets. Sections with identical times and instructor are merged, and their alternate CRNs are shown in case one fills up.
- Light and dark themes, works on phones, and everything is stored locally in your browser.

## How the data is fetched

LAU's Banner 8 "Dynamic Schedule" pages are public but send no CORS headers, so the browser can't call them directly. Instead, `scraper/` runs on a schedule and replays the same requests a browser would make:

1. `GET  /prod/bwckschd.p_disp_dyn_sched`: term list
2. `POST /prod/bwckgens.p_proc_term_date`: subjects for a term
3. `POST /prod/bwckschd.p_get_crse_unsec`: sections, one subject per request, 4 at a time

The HTML is parsed (`scraper/parse.ts`) into compact JSON in `public/data/<term>.json`, which the static site loads.

## Development

```bash
npm install
npm run scrape      # fetch the newest 3 terms from Banner into public/data
npm run dev         # http://localhost:5173
npm test            # parser + solver tests
npm run build       # static site in dist/
```

Scraper options: `npm run scrape -- --terms 202720,202710`, `--count 4`, `--save-fixtures`.

## Deploying (GitHub Pages)

1. Push this folder to a GitHub repository (branch `main`).
2. In the repository, go to **Settings → Pages → Source** and choose **GitHub Actions**.
3. `.github/workflows/deploy.yml` builds and deploys on every push. Every 6 hours it also re-scrapes Banner, commits the new data and redeploys. You can trigger it by hand from the **Actions** tab.

*Unofficial tool, not affiliated with LAU. Always double-check on Banner before registering.*
