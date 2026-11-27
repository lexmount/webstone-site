"use client";

import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { rankableMetric, bestValueLabel, canonicalVersion, formatMetric, type Catalog, type Snapshot } from '../lib/results';
import { coverage, orderComparison, trackComparison, type ComparisonRow } from '../lib/track-comparison';
import { benchmarkHref } from '../lib/overview';
import { providerColors } from '../lib/presentation';
import type { Language } from '../lib/i18n';
import Insights from './insights';
import MethodSelector, {methodColor} from './method-selector';
import InfoTooltip from './info-tooltip';
import MethodDetails from './method-details';
import MethodLabel from './method-label';
import {EvaluationOrigin} from './evaluation-source';
import ResultsTable, {type TableColumn} from './results-table';
import { EvaluationReports } from './home';

type Props = {catalog:Catalog; snapshots:Snapshot[]; trackId:string; layer:string; onLayer:(layer:string)=>void; t:(text:string)=>string; language:Language};

export default function TrackResults({catalog,snapshots,trackId,layer,onLayer,t,language}:Props) {
  const comparison = trackComparison(catalog,snapshots,trackId,layer);
  const [sort,setSort] = useState<{id:string;direction:'asc'|'desc'}|null>(null);
  const [completeOnly,setCompleteOnly] = useState(false);
  const [chartView,setChartView] = useState('benchmarks');
  const [hidden,setHidden]=useState<string[]>([]);
  const [selected,setSelected] = useState<ComparisonRow|null>(null);
  if (!comparison) return <p>{t('No results for this benchmark')}</p>;
  const {columns,rows,profile} = comparison;
  const sortColumn=columns.find(column=>column.info.id===sort?.id) ?? columns[0];
  const direction=sort?.direction ?? sortColumn.metric.direction;
  const ordered=orderComparison(rows.filter(row=>!completeOnly||coverage(row,columns)===columns.length),sortColumn,direction);
  const chartColumns = columns.filter(col => rankableMetric(col.benchmark??{}));
  const complete=ordered.filter(row=>coverage(row,chartColumns)===chartColumns.length);
  const comparableRows=ordered.filter(row=>coverage(row,chartColumns)>0);
  const chartRows=comparableRows.filter(row=>!hidden.includes(row.id));
  const colorMap=Object.fromEntries(rows.map((row,index)=>[row.id,methodColor(index)]));
  const selectedResult=selected && Object.values(selected.results)[0];
  const snapshotsForTrack=snapshots.filter(snapshot=>snapshot.benchmarks.some(b=>columns.some(c=>c.info.id===b.id)));
  return <>
    {trackId==='websearch' && <div className="results-controls"><div className="column-views layer-control" role="group" aria-label={t('Output layer')}>
      {['L1','L2','L3'].map((value,index)=><button key={value} aria-pressed={layer===value} onClick={()=>{setSort(null);onLayer(value);}}>{t(['L1 · Search results','L2 · Supplemental text','L3 · Generated answers'][index])}</button>)}
    </div></div>}
    <nav className="overview-benchmarks" aria-label={t('Included benchmarks')}>
      <span>{t('Included benchmarks')}</span>{columns.map(col=><a key={col.info.id} href={benchmarkHref(col.info.id)}>{col.info.name.replace(/^LexBench /,'')}</a>)}
    </nav>
    <ResultsTable caption={`${comparison.track.name} ${t('Overview')}`} rows={ordered} columns={columns.map((col):TableColumn<ComparisonRow>=>({
      id:`benchmark:${col.info.id}`,label:t(col.metric.label),direction:col.metric.direction,value:row=>row.results[col.info.id]?.provider.scores[col.metric.id],rankable:rankableMetric(col.benchmark??{}),
      highlight:rankableMetric(col.benchmark??{}),winnerLabel:t(bestValueLabel(col.benchmark??{},col.metric.direction,col.metric)),
      before:<a className="overview-benchmark-link" href={`${benchmarkHref(col.info.id)}${col.snapshot?'&version='+canonicalVersion(col.snapshot.version):''}`}><span>{col.info.name.replace(/^LexBench /,'')}</span><ArrowUpRight size={11} aria-hidden="true"/></a>,
      details:<InfoTooltip label={col.info.name} description={t(col.metric.description??'')} sources={[{label:t('Evaluation report'),url:col.benchmark?.reportUrl??col.info.reportUrl}]} sourcesLabel={t('Reports')} detailsLabel={t('details')}/>,
      after:<small className="overview-edition">{col.snapshot?canonicalVersion(col.snapshot.version):t('No published results')}</small>,
      render:row=>{const measured=row.results[col.info.id],value=measured?.provider.scores[col.metric.id];return value===null||value===undefined?'—':<><a href={`${benchmarkHref(col.info.id)}&version=${canonicalVersion(col.snapshot!.version)}&metric=${col.metric.id}`} title={measured.provider.name}>{formatMetric(value,col.metric.unit,col.metric.decimals)}</a>{measured.provider.name!==row.name&&<small className="measured-configuration">{measured.provider.name}</small>}</>;},
    }))} sortId={`benchmark:${sortColumn.info.id}`} direction={direction} onSort={(id,direction)=>setSort({id:id.slice('benchmark:'.length),direction})} identity={`${trackId}:${layer}`} overview t={t} tie={(a,b)=>a.name.localeCompare(b.name)}
      empty={t(completeOnly?'No methods have results for every benchmark.':'No published results')}
      toolbar={<><span className="table-summary">{ordered.length} {t('methods')} · {columns.length} {t('benchmarks')}</span><div className="column-views" role="group" aria-label={t('Result coverage')}><button aria-pressed={!completeOnly} onClick={()=>setCompleteOnly(false)}>{t('All methods')}</button><button aria-pressed={completeOnly} onClick={()=>setCompleteOnly(true)}>{t('All benchmarks')}</button></div></>}
      method={row=>{
        const measured = Object.values(row.results)[0];
        return <div className="provider-cell">
          <a className="provider-name provider-link" href={catalog.providerUrls[measured.provider.id]} target="_blank" rel="noopener noreferrer" aria-label={`${row.name} ${t('project')} (${t('opens in a new tab')})`}>
            <span className="provider-mark" style={{'--provider-color':providerColors[row.id]??'#64748b'} as React.CSSProperties} aria-hidden="true">{row.name[0]}</span>
            <MethodLabel name={row.name} t={t}><small className="method-coverage">{coverage(row,columns)}/{columns.length} {t('benchmarks')}</small><EvaluationOrigin resultId={measured.column.snapshot?.id} providerId={measured.provider.id} t={t}/></MethodLabel>
            <ArrowUpRight className="provider-external" size={12}/>
          </a>
          <button className="method-open" aria-label={`${row.name} · ${t('Method details')}`} aria-haspopup="dialog" onClick={()=>setSelected(row)}>···</button>
        </div>;
      }}
    />
    {chartColumns.length > 0 && <section className="overview-comparisons" aria-label={t('Results comparison')}>
      <div className="column-views overview-chart-controls" role="group" aria-label={t('Chart view')}>
        <button aria-pressed={chartView==='benchmarks'} onClick={()=>setChartView('benchmarks')}>{t('By benchmark')}</button>
        {chartColumns.length>=3&&<button aria-pressed={chartView==='radar'} onClick={()=>setChartView('radar')}>{t('Radar')} · {complete.length} {t('methods')}</button>}
      </div>
      {chartView==='radar'&&chartColumns.length>=3 ? <>{complete.length===0&&<p className="comparison-empty" role="status">{t('No methods have results for every benchmark.')}</p>}<Insights key={`${trackId}:${layer}:radar`} benchmark={{...profile,providers:complete.map(row=>profile.providers.find(p=>p.id===row.id)!),providerCount:complete.length}} t={t} caption="" preserveOrder coverageTotal={chartColumns.length} colors={colorMap} hiddenMethods={hidden} onHiddenChange={setHidden}/></>
        : <div className="overview-chart-layout"><MethodSelector providers={comparableRows} hidden={hidden} onChange={setHidden} t={t} colors={colorMap} coverage={Object.fromEntries(comparableRows.map(row=>[row.id,`${coverage(row,chartColumns)}/${chartColumns.length}`]))}/><div className="benchmark-comparisons">{chartColumns.map(col=>{
          const providers=chartRows.flatMap(row=>{const measured=row.results[col.info.id];return typeof measured?.provider.scores[col.metric.id]==='number'?[{...measured.provider,id:row.id,name:row.name}]:[];});
          const benchmark={...profile,comparisonMode:col.benchmark?.comparisonMode,rankable:col.benchmark?.rankable,id:col.info.id,name:col.info.name,metrics:[col.metric],keyMetricIds:[col.metric.id],primaryMetric:col.metric.id,categories:[],providers,providerCount:providers.length};
          return <div key={col.info.id}>{providers.length ? <Insights benchmark={benchmark} t={t} heading={col.info.name.replace(/^LexBench /,'')} caption="" preserveOrder hideLegend colors={colorMap}/>:<p>{col.info.name}: {t(col.benchmark?.providers.length ? 'Select a method to show its results.' : 'No published results')}</p>}</div>;
        })}</div></div>}
    </section>}
    {selectedResult?.column.benchmark&&<MethodDetails provider={selectedResult.provider} benchmark={selectedResult.column.benchmark} catalog={catalog} snapshots={snapshots} showScores={false} t={t} onClose={()=>setSelected(null)}/>}
    <EvaluationReports catalog={catalog} snapshots={snapshotsForTrack} t={t} language={language}/>
  </>;
}
