import Link from 'next/link';
import Top from '@/components/Top';
import { getApp } from '@/lib/app';
import { readBatchResults } from '@/lib/batch-results';

export const dynamic = 'force-dynamic';

const states: Record<string, string> = {
  pending: 'Pending',
  held: 'Needs review',
  tagged: 'Material recorded',
  rejected: 'Excluded',
  edited: 'Edited by reviewer',
  approved: 'Approved by reviewer',
};

export default async function BatchResults({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { db } = await getApp();
  const results = await readBatchResults(db, (await searchParams).batch);

  return <>
    <Top title="Batch results" />
    <main className="page results">
      {!results ? <div className="done"><h2>Batch not found</h2><p>Open Batch results from Home to view the latest batch.</p></div> : <>
        <section className="results-summary" aria-label="Batch summary">
          <h2>{results.batchId}</h2>
          <p>{results.items.length} items · {results.items.filter((item) => item.state === 'tagged').length} recorded
            {' · '}{results.items.filter((item) => item.state === 'held').length} awaiting review</p>
          <Link href="/check">Check labels</Link>
        </section>
        {results.items.map((item) => {
          const { evidence, review } = item;
          const status = states[review?.state === 'rejected' ? 'rejected' : review?.state ?? item.state] ?? 'Pending';
          return <article className="result-card" key={item.style}>
            <header><h2>{item.style}</h2><span>{status}</span></header>
            {item.description && <p className="small">{item.description}</p>}
            <dl>
              <dt>Material</dt>
              <dd>{item.state === 'rejected' ? 'Not recorded' : item.material ?? 'Not confirmed'}</dd>
              <dt>Source</dt>
              <dd>
                {review?.state === 'edited' && <div>Reviewer entry</div>}
                {evidence.website && <div><a href={evidence.website.url} target="_blank" rel="noreferrer">Product page</a>
                  {evidence.website.composition && <div className="small">{evidence.website.composition}</div>}</div>}
                {evidence.label && <div>Label description <span className="small">{evidence.label}</span></div>}
                {evidence.workbookRows.length > 0 && <details>
                  <summary>Catalog evidence</summary>
                  {evidence.workbookUrl && <a href={evidence.workbookUrl} target="_blank" rel="noreferrer">Open workbook</a>}
                  <ul>{evidence.workbookRows.map((source) => <li key={`${source.sheet}:${source.row}`}>
                    {source.sheet}, row {source.row}{source.composition && ` · ${source.composition}`}
                  </li>)}</ul>
                </details>}
                {!review?.after && !evidence.website && !evidence.label && !evidence.workbookRows.length && 'No source recorded'}
              </dd>
              <dt>Manual change</dt>
              <dd>{review?.after ? <><div>Before: {review.before ?? 'No confirmed material'}</div><div>After: {review.after}</div></>
                : review?.state === 'rejected' ? 'Excluded by reviewer' : review?.state === 'approved' ? 'Approved without changes' : 'None'}</dd>
            </dl>
            {item.reason && <p className="small">{item.reason}</p>}
          </article>;
        })}
      </>}
    </main>
  </>;
}
