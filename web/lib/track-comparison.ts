import { rankableMetric, compareValues, compareVersions, resolveBenchmark, type Benchmark, type BenchmarkInfo, type Catalog, type Metric, type Provider, type Snapshot } from './results.ts';
import { methodIdentity } from './methods.ts';

export type ComparisonColumn = { info: BenchmarkInfo; benchmark: Benchmark | null; metric: Metric; snapshot: Snapshot | null };
export type ComparisonRow = { id: string; name: string; results: Record<string, { provider: Provider; column: ComparisonColumn }> };
export function coverage(row: ComparisonRow, columns: ComparisonColumn[]) {
  return columns.filter(column => typeof row.results[column.info.id]?.provider.scores[column.metric.id] === 'number').length;
}
export function orderComparison(rows: ComparisonRow[], column: ComparisonColumn, direction: 'asc'|'desc') {
  return [...rows].sort((a,b) => {
    const left=a.results[column.info.id]?.provider.scores[column.metric.id],right=b.results[column.info.id]?.provider.scores[column.metric.id];
    return compareValues(left,right,direction) || a.name.localeCompare(b.name);
  });
}
export function trackComparison(catalog: Catalog, snapshots: Snapshot[], trackId: string, layer = 'L1') {
  const track = catalog.tracks.find(track => track.id === trackId && track.overview);
  if (!track) return null;
  const columns: ComparisonColumn[] = catalog.benchmarks.filter(bench => bench.trackId === trackId && (!bench.outputLayer || bench.outputLayer === layer)).map(info => {
    const snapshot = snapshots.filter(s => s.benchmarks.some(b => b.id === info.id)).sort((a,b) => compareVersions(a.version,b.version)).at(-1) ?? null;
    const result = snapshot?.benchmarks.find(b => b.id === info.id);
    const benchmark = result ? resolveBenchmark(catalog,result) : null;
    const definition = benchmark ?? info.definitions.at(-1)!;
    const metric = definition.metrics.find(m => m.id === definition.primaryMetric)!;
    return {info,benchmark,metric,snapshot};
  });
  if (!columns.length) return null;
  const grouped = new Map<string,ComparisonRow>();
  for (const column of columns) for (const provider of column.benchmark?.providers ?? []) {
    const method = methodIdentity(catalog,provider.id);
    const row = grouped.get(method.id) ?? {id:method.id,name:method.name,results:{}};
    if (row.results[column.info.id]) throw new Error(`Ambiguous overview method: ${trackId}/${method.id}/${column.info.id}`);
    row.results[column.info.id] = {provider,column};
    grouped.set(method.id,row);
  }
  const rows = orderComparison([...grouped.values()],columns[0],columns[0].metric.direction);
  const metrics = columns.filter(({benchmark}) => rankableMetric(benchmark??{})).map(({info,metric,benchmark}) => ({...metric,comparisonMode:benchmark?.comparisonMode ?? metric.comparisonMode,id:`${info.id}:${metric.id}`,label:info.name.replace(/^LexBench /,'')}));
  const providers: Provider[] = rows.map(row => ({
    id:row.id,name:row.name,description:'',mode:'',passed:null,
    scores:Object.fromEntries(columns.map(column => [`${column.info.id}:${column.metric.id}`,row.results[column.info.id]?.provider.scores[column.metric.id] ?? null])),
  }));
  const first = columns.find(column => column.benchmark)?.benchmark;
  // The empty benchmark still exposes catalog columns; it contains no invented results.
  const profile: Benchmark = {
    ...(first ?? {...columns[0].info,...columns[0].info.definitions.at(-1)!,definitionId:columns[0].info.definitions.at(-1)!.id,taskCount:null,notes:[]}),
    id:`track:${trackId}`,name:track.name,rankable:true,comparisonMode:undefined,primaryMetric:metrics[0]?.id ?? columns[0].metric.id,
    metrics,keyMetricIds:metrics.map(metric=>metric.id),categories:[],providers,providerCount:providers.length,
  };
  return {track,columns,rows,profile};
}
