import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Top from '@/components/Top';

export const dynamic = 'force-dynamic';

type Site = {
  name: string;
  guidelines: string;
  materials: string;
  address: string;
  hours: string;
  sources: string;
};

export default async function Dropoffs() {
  let sites: Site[] = [];
  try {
    sites = JSON.parse(await readFile(join(process.cwd(), 'data', 'dropoff-sites.local.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  return <>
    <Top title="Textile drop-off directory" />
    <main className="page">
      <p className="hint">Use this directory to choose a site for manual drop-off. Check the source for current hours and acceptance rules before routing a lot.</p>
      {sites.length === 0 && <p className="empty">No drop-off directory has been imported.</p>}
      {sites.map(site => (
        <details className="reqdoc" key={`${site.name}:${site.address}`} style={{ marginBottom: 12 }}>
          <summary>{site.name}</summary>
          <p><b>Address:</b> {site.address}</p>
          <p><b>Hours:</b> {site.hours}</p>
          <p><b>Materials:</b> {site.materials}</p>
          <p>{site.guidelines}</p>
          <p>{site.sources.split(';').map(source => source.trim()).filter(source => /^https?:\/\//i.test(source))
            .map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer">Source {index + 1} </a>)}</p>
        </details>
      ))}
    </main>
  </>;
}
