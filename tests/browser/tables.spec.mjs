import {test,expect} from '@playwright/test';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';

// Use published inputs as the oracle; do not import the renderer's sort or winner helpers.
const catalog=JSON.parse(readFileSync('benchmarks/catalog.json','utf8'));
const reports=readdirSync('results',{recursive:true}).filter(file=>file.endsWith('-report.json')).sort().map(file=>JSON.parse(readFileSync(`results/${file}`,'utf8')));
const crossSourceBenches = new Set(['bu-bench-v1','online-mind2web','webvoyager','osworld']);
const sortedBackground='rgb(234, 244, 238)';
const winnerBackground='rgb(238, 248, 241)';
const hoverBackground='rgb(228, 243, 233)';
const winnerText='rgb(27, 107, 69)';
const opposite=direction=>direction==='asc'?'desc':'asc';
const numeric=value=>typeof value==='number';
const columnSelector=id=>`[data-column="${id}"]`;
const reportVersion=version=>`v${version.replace(/^v/,'').split('.').concat(['0','0']).slice(0,3).join('.')}`;
function editionOrder(a,b) {
  const left=reportVersion(a.version).slice(1).split('.').map(Number),right=reportVersion(b.version).slice(1).split('.').map(Number);
  return left[0]-right[0]||left[1]-right[1]||left[2]-right[2];
}
function expectedWinner(rows,column) {
  const values=rows.map(row=>column.value(row)).filter(numeric);
  if(column.allowed===false||new Set(values).size<2)return null;
  return column.direction==='asc'?Math.min(...values):Math.max(...values);
}
// Source labels do not remove numeric ranks, extrema or charts. Descriptive
// output length and non-point billing still have no best-value claim.
function publishedColumns(info,result,...options) {
  const def=definition(info,result);
  return benchmarkColumns(info,result,...options).map(column=>({...column,
    allowed:def.rankable!==false && !column.pricing,
  }));
}
function expectedExtremumLabel(column,language) {
  let labels=['Best in this column','本列最佳'];
  if(column.descriptive)labels=column.direction==='asc'?['Lowest value','本列最低值']:['Highest value','本列最高值'];
  else if(column.reported)labels=column.direction==='asc'?['Lowest reported value','公开结果中的最低值']:['Highest reported value','公开结果中的最高值'];
  return labels[language==='zh'?1:0];
}
function expectedOrder(rows,column,direction,alphabetical=false) {
  return [...rows].sort((a,b)=>{
    const left=column.value(a),right=column.value(b);
    const tie=alphabetical?a.name.localeCompare(b.name):0;
    if(!numeric(left))return numeric(right)?1:tie;
    if(!numeric(right))return -1;
    return (direction==='asc'?left-right:right-left)||tie;
  }).map(row=>row.id);
}
async function open(page,url,language) {
  await page.addInitScript(language=>localStorage.setItem('webstone-language',language),language);
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.locator('.wide-table')).toBeVisible();
}
async function inspect(page,rows,columns,sort,direction,alphabetical,language) {
  assert(['en','zh'].includes(language),'project language is required');
  await page.mouse.move(0,0);
  await page.locator('.wide-table').evaluate(async table=>{
    await Promise.all(table.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));
  });
  const state=await page.locator('.wide-table').evaluate(table=>({
    headers:[...table.querySelectorAll('thead [data-column]')].map(cell=>({id:cell.dataset.column,sort:cell.getAttribute('aria-sort'),bg:getComputedStyle(cell).backgroundColor,font:getComputedStyle(cell.querySelector('.sort-button')??cell).fontWeight,color:getComputedStyle(cell.querySelector('.sort-button')??cell).color,position:getComputedStyle(cell).position})),
    rows:[...table.querySelectorAll('tbody tr')].map(row=>({id:row.dataset.provider,rank:row.querySelector('.rank-cell')?.innerText,cells:[...row.querySelectorAll('td[data-column]')].map(cell=>({id:cell.dataset.column,text:cell.innerText,title:cell.getAttribute('title'),bg:getComputedStyle(cell).backgroundColor,color:getComputedStyle(cell.querySelector('a')??cell).color,font:getComputedStyle(cell.querySelector('a')??cell).fontWeight,position:getComputedStyle(cell).position,label:cell.querySelector('.sr-only')?.textContent.trim()??''}))})),
  }));
  const toolbar=await page.locator('.table-toolbar').boundingBox(),scroll=await page.locator('.table-scroll').boundingBox();
  assert(Math.abs(toolbar.x-scroll.x)<2,'toolbar and table left edges differ');
  assert(Math.abs(toolbar.x+toolbar.width-scroll.x-scroll.width)<2,'toolbar and table right edges differ');
  // Bulk assertions avoid recording hundreds of thousands of duplicate trace steps.
  assert.deepEqual(state.rows.map(row=>row.id),expectedOrder(rows,sort,direction,alphabetical));
  for (const actual of state.rows) {
    const value=sort.value(rows.find(row=>row.id===actual.id));
    const rank=!numeric(value)||sort.rankable===false?'—':String(1+rows.filter(row=>{const other=sort.value(row);return numeric(other)&&(sort.direction==='asc'?other<value:other>value);}).length);
    assert.equal(actual.rank,sort.rankable===false?undefined:rank,`${actual.id}: rank follows the selected metric, shares ties and survives reverse sorting`);
  }
  assert.deepEqual(state.headers.filter(header=>header.sort==='ascending'||header.sort==='descending').map(header=>header.id),[sort.id]);
  assert.deepEqual(state.headers.map(header=>header.id).sort(),columns.map(column=>column.id).sort());
  for(const column of columns) {
    const header=state.headers.find(header=>header.id===column.id);
    assert(header,`missing header ${column.id}`);
    assert.notEqual(header.position,'sticky');
    if(column.id===sort.id){assert.equal(header.sort,direction==='asc'?'ascending':'descending');assert.equal(header.bg,sortedBackground);assert.equal(header.color,'rgb(47, 90, 63)');assert(+header.font>=600);}
    else assert.notEqual(header.bg,sortedBackground);
    const best=expectedWinner(rows,column);
    for(const actual of state.rows) {
      const source=rows.find(row=>row.id===actual.id),cell=actual.cells.find(cell=>cell.id===column.id),value=column.value(source);
      const context=`${actual.id}/${column.id}`;
      assert(cell,context);assert.notEqual(cell.position,'sticky');
      if(column.pricing) {
        const price=source.pricing;
        const expected=price&&numeric(price.min)&&numeric(price.max)?[price.min,...(price.max===price.min?[]:[price.max])]:price&&numeric(price.softwareCost)?[price.softwareCost]:[];
        assert.deepEqual((cell.text.match(/[+-]?\d+(?:\.\d+)?/g)??[]).map(Number),expected,context);
      } else if(!numeric(value))assert.equal(cell.text.trim(),'—',context);
      else {
        const shown=cell.text.match(/[+-]?\d+(?:\.\d+)?/);
        assert(shown,`${context}: displayed number`);
        const expected=column.displayValue?column.displayValue(source):value*(column.scale??1);
        assert.equal(+shown[0],+expected.toFixed(column.precision??2),context);
      }
      const wins=best!==null&&value===best;
      if(wins) {
        assert.equal(cell.bg,winnerBackground,`${context}: winner background`);
        assert.equal(cell.color,winnerText,`${context}: winner text`);assert(+cell.font>=600);
        const label=expectedExtremumLabel(column,language);
        assert.equal(cell.label,label,`${context}: winner accessibility label`);
        assert(cell.title?.includes(label),`${context}: winner hover explanation survives custom count and method details`);
        const counts=source.counts?.[column.id.replace(/^metric:/,'')];
        if(counts)assert(cell.title.includes(`${counts.count} / ${counts.total}`),`${context}: hover retains source counts`);
      } else {assert(![winnerBackground,hoverBackground].includes(cell.bg),context);assert.equal(cell.label,'',context);}
    }
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflows horizontally');
}
async function sortEach(page,rows,columns,initial,alphabetical,language) {
  let active=initial.id,direction=initial.direction;
  for(const column of columns.filter(column=>column.sortable!==false)) {
    const button=page.locator(`th${columnSelector(column.id)} button.sort-button`);
    for(let click=0;click<2;click++) {
      direction=active===column.id?opposite(direction):column.direction;active=column.id;
      await button.click();
      await inspect(page,rows,columns,column,direction,alphabetical,language);
    }
  }
  return {column:columns.find(column=>column.id===active),direction};
}
function definition(info,result){return info.definitions.find(definition=>definition.id===result.definitionId);}
function benchmarkColumns(info,result,expanded,categories=true) {
  const def=definition(info,result);
  const metrics=def.metrics.filter(metric=>metric.id===def.primaryMetric||result.providers.some(provider=>numeric(provider.scores[metric.id]))).filter(metric=>expanded||def.keyMetricIds.includes(metric.id));
  return [
    ...metrics.map(metric=>({id:`metric:${metric.id}`,rankable:def.rankable!==false,direction:metric.direction,value:provider=>provider.scores[metric.id],allowed:def.rankable!==false,descriptive:metric.highlightBest===false,reported:def.comparisonMode==='reported'||metric.comparisonMode==='reported',scale:metric.unit==='ratio'?100:metric.unit==='ms'?0.001:1,precision:metric.unit==='ratio'?Math.max(0,metric.decimals-2):metric.unit==='ms'?Math.min(6,metric.decimals+3):metric.unit==='seconds'?Math.max(3,metric.decimals):metric.decimals})),
    ...(categories?(def.categories??[]).map(category=>({id:`category:${category.id}`,direction:'desc',value:provider=>provider.categoryPassed?.[category.id],displayValue:provider=>provider.categoryPassed[category.id]/result.categoryTotals[category.id]*100,precision:1,reported:def.comparisonMode==='reported',allowed:def.rankable!==false,sortable:false})):[]),
    ...(result.providers.some(provider=>provider.pricing&&(numeric(provider.pricing.min)&&numeric(provider.pricing.max)||numeric(provider.pricing.softwareCost)))?[{id:'pricing',pricing:true,sortable:false,allowed:false,value:()=>null}]:[]),
    ...(categories&&result.providers.some(provider=>numeric(provider.passed))?[{id:'passed',direction:'desc',value:provider=>provider.passed,reported:def.comparisonMode==='reported',allowed:def.rankable!==false,sortable:false}]:[]),
  ];
}
for(const report of reports) {
  const result=report.benchmarks[0],info=catalog.benchmarks.find(info=>info.id===result.id),def=definition(info,result);
  test(`${result.id} ${report.version}: every metric and visible column`,async({page},testInfo)=>{
    const language=testInfo.project.metadata.language;
    await open(page,`/?benchmark=${result.id}&version=${report.version}`,language);
    const key=publishedColumns(info,result,false);
    const primary=key.find(column=>column.id===`metric:${def.primaryMetric}`);
    await inspect(page,result.providers,key,primary,primary.direction,false,language);
    await expect(page.locator('.insights-section')).toHaveCount(1);
    if(typeof result.taskCount==='number') {
      const count=await page.evaluate(value=>value.toLocaleString(),result.taskCount);
      await expect(page.locator('.table-summary')).toContainText(count);
    }
    const method=await page.locator('thead .method-cell').boundingBox(),score=await page.locator(`thead ${columnSelector(primary.id)}`).boundingBox();
    expect(score.x).toBeGreaterThanOrEqual(method.x+method.width-1);
    expect(score.x).toBeLessThan((await page.locator('.table-scroll').boundingBox()).x+(await page.locator('.table-scroll').boundingBox()).width);
    const more=page.locator('.table-controls button').filter({hasText:language==='en'?'More metrics':'更多指标'});
    if(await more.count())await more.click();
    const columns=publishedColumns(info,result,true);
    const final=await sortEach(page,result.providers,columns,primary,false,language);
    if((def.categories??[]).length) {
      await page.locator('.table-controls button').filter({hasText:language==='en'?'Category breakdown':'分类结果'}).click();
      await inspect(page,result.providers,publishedColumns(info,result,true,false),final.column,final.direction,false,language);
    }
    // Winners keep their own direction even while another metric is sorted in reverse.
    const bestColumn=columns.find(column=>expectedWinner(result.providers,column)!==null);
    if(bestColumn) {
      const best=expectedWinner(result.providers,bestColumn),row=result.providers.find(row=>bestColumn.value(row)===best);
      const cell=page.locator(`tr[data-provider="${row.id}"] td${columnSelector(bestColumn.id)}`);
      if(await cell.count()) {await cell.hover();await expect(cell).toHaveCSS('background-color',hoverBackground);}
    }
    await page.locator('.table-controls button').filter({hasText:language==='en'?'Key metrics':'关键指标'}).click();
    await expect(page.locator('th[data-column^="metric:"]')).toHaveCount(key.filter(column=>column.id.startsWith('metric:')).length);
    const scroll=page.locator('.table-scroll');
    await scroll.evaluate(node=>{node.scrollLeft=node.scrollWidth;});
    const sticky=await page.locator('tbody tr:first-child .method-cell').evaluate(cell=>({position:getComputedStyle(cell).position,left:cell.getBoundingClientRect().left}));
    const ranks=page.locator('tbody tr:first-child .rank-cell'),box=await scroll.boundingBox();
    const width=await ranks.count() ? (await ranks.boundingBox()).width : 0;
    expect(sticky.position).toBe('sticky');expect(sticky.left).toBeCloseTo(box.x+width+1,0);
  });
}
function overview(track,layer) {
  const columns=catalog.benchmarks.filter(info=>info.trackId===track.id&&(!info.outputLayer||info.outputLayer===layer)).map(info=>{
    const report=reports.filter(report=>report.benchmarks[0].id===info.id).sort(editionOrder).at(-1),result=report?.benchmarks[0];
    const def=result?definition(info,result):info.definitions.at(-1),metric=def.metrics.find(metric=>metric.id===def.primaryMetric);
    return {id:`benchmark:${info.id}`,info,report,result,metric,direction:metric.direction,rankable:def.rankable!==false,allowed:def.rankable!==false,reported:def.comparisonMode==='reported',scale:metric.unit==='ratio'?100:metric.unit==='ms'?0.001:1,precision:metric.unit==='ratio'?Math.max(0,metric.decimals-2):metric.decimals,value:row=>row.values[info.id]};
  });
  const rows=new Map();
  for(const column of columns)for(const provider of column.result?.providers??[]){
    const method=catalog.methods.find(method=>method.providerIds.includes(provider.id));
    expect(method,provider.id).toBeTruthy();
    const row=rows.get(method.id)??{id:method.id,name:method.name,values:{}};
    row.values[column.info.id]=provider.scores[column.metric.id];rows.set(row.id,row);
  }
  return {columns,rows:[...rows.values()]};
}
for(const track of catalog.tracks.filter(track=>track.overview))for(const layer of(track.id==='websearch'?['L1','L2','L3']:['L1'])) {
  test(`${track.id} ${layer}: all Overview columns and coverage filters`,async({page},testInfo)=>{
    const language=testInfo.project.metadata.language;
    await open(page,`/?track=${track.id}&layer=${layer}`,language);
    const {columns,rows}=overview(track,layer);
    await inspect(page,rows,columns,columns[0],columns[0].direction,true,language);
    const final=await sortEach(page,rows,columns,columns[0],true,language);
    await page.locator('.table-toolbar .column-views button').nth(1).click();
    const complete=rows.filter(row=>columns.every(column=>numeric(column.value(row))));
    await inspect(page,complete,columns,final.column,final.direction,true,language);
    await sortEach(page,complete,columns,{...final.column,direction:final.direction},true,language);
    for(const column of columns) {
      const link=page.locator(`th${columnSelector(column.id)} .overview-benchmark-link`);
      const geometry=await link.evaluate(link=>{const icon=link.querySelector('svg').getBoundingClientRect(),text=link.querySelector('span').getBoundingClientRect();return {icon:{x:icon.x,y:icon.y,width:icon.width,height:icon.height},text:{x:text.x,y:text.y,width:text.width,height:text.height}};});
      expect(geometry.icon.x).toBeGreaterThanOrEqual(geometry.text.x+geometry.text.width-1);
      expect(geometry.icon.y).toBeLessThan(geometry.text.y+geometry.text.height);
    }
  });
}

test('source labels and original links retain numeric ranks, extrema and quality charts',async({page},testInfo)=>{
  const language=testInfo.project.metadata.language;
  for(const id of crossSourceBenches) {
    await open(page,`/?benchmark=${id}&version=v1.0.0`,language);
    const report=reports.find(report=>report.benchmarks[0].id===id&&reportVersion(report.version)==='v1.0.0');
    const result=report.benchmarks[0],info=catalog.benchmarks.find(info=>info.id===id);
    const extrema=publishedColumns(info,result,false).reduce((count,column)=>{
      const winner=expectedWinner(result.providers,column);
      return count+(winner===null?0:result.providers.filter(row=>column.value(row)===winner).length);
    },0);
    await expect(page.locator('tbody .rank-cell')).toHaveCount(result.providers.length);
    await expect(page.locator('.best-value')).toHaveCount(extrema);
    await expect(page.locator('.insights-section')).toHaveCount(1);
    await expect(page.locator('.evaluation-source-label')).toHaveCount(result.providers.length);
    expect(await page.locator('tbody tr').count()).toBe(report.benchmarks[0].providers.length);
    for(const row of report.benchmarks[0].providers) {
      await page.locator(`tr[data-provider="${row.id}"] .method-open`).click();
      const source=page.locator('.method-dialog > .evaluation-source');
      await expect(source).toBeVisible();
      await expect(source.locator('a')).not.toHaveCount(0);
      const annotation=JSON.parse(readFileSync('reports/metadata.json','utf8')).evaluations[report.id][row.id];
      const labels={author:['Report author’s evaluation','报告作者实测'],blog:['Official blog','官方博客'],paper:['Research paper','研究论文'],repository:['Public code and results','公开代码与结果'],'model-card':['Model card','模型说明文档'],archive:['Published trajectories','公开评测轨迹']};
      await expect(page.locator(`tr[data-provider="${row.id}"] .evaluation-source-label`)).toHaveText(labels[annotation.origin][language==='zh'?1:0]);
      await expect(source).toContainText(annotation.publisher);
      expect(await source.locator('a').evaluateAll(links=>links.map(link=>link.href))).toEqual(annotation.links.map(link=>link.url));
      await page.keyboard.press('Escape');
    }
  }
  await open(page,'/?track=browser-use',language);
  const expected=overview(catalog.tracks.find(track=>track.id==='browser-use'),'L1');
  await expect(page.locator('tbody .rank-cell')).toHaveCount(expected.rows.length);
  await expect(page.locator('.overview-comparisons .quality-comparison')).toHaveCount(expected.columns.filter(column=>column.rankable!==false&&column.result?.providers.some(row=>numeric(row.scores[column.metric.id]))).length);
});

test('reports fill two grid rows before paging, retain every report and clamp after resizing',async({page},testInfo)=>{
  const language=testInfo.project.metadata.language;
  await page.addInitScript(language=>localStorage.setItem('webstone-language',language),language);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.locator('.track-card[data-track="browser-use"]')).toBeVisible();
  const metadata=JSON.parse(readFileSync('reports/metadata.json','utf8')).reports;
  const ids=Object.entries(metadata).filter(([id])=>reports.some(report=>report.id===id)).sort((a,b)=>b[1].publishedAt.localeCompare(a[1].publishedAt)).map(([id])=>id);
  const grid=page.locator('#reports .article-grid');
  let selectedPage=0;
  for(const width of [390,1000,1600,3840,390]) {
    await page.setViewportSize({width,height:1000});
    const columns=await grid.evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length);
    const size=columns*2;
    await expect(grid).toHaveAttribute('data-page-size',String(size));
    const pages=Math.ceil(ids.length/size);
    selectedPage=Math.min(selectedPage,pages-1);
    const currentIds=()=>grid.locator('article').evaluateAll(nodes=>nodes.map(node=>node.dataset.report));
    expect(await currentIds()).toEqual(ids.slice(selectedPage*size,(selectedPage+1)*size));
    const previous=page.locator('.report-pagination button').first(),next=page.locator('.report-pagination button').last();
    if(pages>1)await expect(page.locator('.report-pagination [role="status"]')).toHaveText(`${selectedPage+1} / ${pages}`);
    for(let back=0;back<selectedPage;back++)await previous.click();
    selectedPage=0;
    const seen=[];
    for(let pageNumber=0;pageNumber<Math.ceil(ids.length/size);pageNumber++) {
      const shown=await grid.locator('article').evaluateAll(nodes=>nodes.map(node=>node.dataset.report));
      expect(shown).toEqual(ids.slice(pageNumber*size,(pageNumber+1)*size));
      expect(shown.length).toBe(Math.min(size,ids.length-pageNumber*size));
      seen.push(...shown);selectedPage=pageNumber;
      if(pageNumber+1<Math.ceil(ids.length/size))await next.click();
    }
    expect(seen).toEqual(ids);
    if(ids.length>size)await expect(next).toBeDisabled();
    else await expect(page.locator('.report-pagination')).toHaveCount(0);
  }
});

test('Resources opens upward beside language controls and track chips stay spaced and scrollable',async({page},testInfo)=>{
  const language=testInfo.project.metadata.language;
  await page.addInitScript(language=>localStorage.setItem('webstone-language',language),language);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.locator('.track-card[data-track="browser-use"]')).toBeVisible();
  const menu=page.getByRole('button',{name:language==='en'?'Open navigation':'打开导航',exact:true});
  if(await menu.isVisible())await menu.click();
  await expect(page.locator('.sidebar-footer > a')).toHaveCount(0);
  const resources=page.locator('.sidebar-resources summary'),languages=page.locator('.language-control');
  await expect(resources).toBeVisible();
  const rb=await resources.boundingBox(),lb=await languages.boundingBox();
  expect(Math.abs(rb.y+rb.height/2-lb.y-lb.height/2)).toBeLessThan(5);
  await resources.click();
  const panel=page.locator('.sidebar-guides');await expect(panel).toBeVisible();
  expect((await panel.boundingBox()).y+(await panel.boundingBox()).height).toBeLessThanOrEqual(rb.y-4);
  await expect(panel.locator('a')).toHaveCount(4);
  const feedback=panel.getByRole('link',{name:language==='en'?'Bugs and feature requests GitHub Issues':'问题与需求反馈 GitHub Issues'});
  await expect(feedback).toHaveAttribute('href','https://github.com/lexmount/webstone-site/issues');
  await expect(feedback).toBeInViewport();
  await resources.click();await expect(panel).toBeHidden();
  await expect(page.locator('.overview-star')).toContainText('GitHub');
  await expect(page.locator('.overview-star')).toHaveAttribute('href','https://github.com/lexmount/webstone');
  await expect(page.locator('.overview-feedback a')).toHaveAttribute('href','https://github.com/lexmount/webstone-site/issues');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  const scrim=page.locator('.sidebar-scrim');if(await scrim.count())await scrim.press('Enter');
  for(const track of catalog.tracks.filter(track=>!track.url)) {
    const benchmarks=catalog.benchmarks.filter(benchmark=>benchmark.trackId===track.id&&(!benchmark.outputLayer||benchmark.outputLayer==='L1'));
    if(!benchmarks.length)continue;
    const list=page.locator(`.track-card[data-track="${track.id}"] .track-benchmark-list`);
    const members=await list.locator('a').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).searchParams.get('benchmark')));
    expect(members).toEqual(benchmarks.map(benchmark=>benchmark.id));
    expect(await list.evaluate(node=>getComputedStyle(node).overflowY)).toBe('auto');
    const spacing=await list.evaluate(node=>node.firstElementChild.getBoundingClientRect().top-node.getBoundingClientRect().top);
    expect(spacing).toBeGreaterThanOrEqual(8);
    for(const link of await list.locator('a').all()) {await link.focus();await expect(link).toBeInViewport();}
    const height=await list.evaluate(node=>node.clientHeight);
    await list.evaluate(node=>{for(let i=0;i<32&&node.scrollHeight<=node.clientHeight;i++)node.append(node.firstElementChild.cloneNode(true));});
    expect(await list.evaluate(node=>node.clientHeight)).toBe(height);
    expect(await list.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
    await list.locator('a').last().focus();
    expect(await list.evaluate(node=>node.scrollTop>0)).toBe(true);
  }
});

test('ties, zero, negative deltas, missing values and diagnostic tables render correctly',async({page},testInfo)=>{
  const language=testInfo.project.metadata.language;
  const fixtureCatalog=structuredClone(catalog),info=fixtureCatalog.benchmarks.find(info=>info.id==='lexbench-webfetch');
  const metrics=[
    {id:'quality',label:'Quality',unit:'score',decimals:1,direction:'desc'},
    {id:'delta',label:'Signed delta',unit:'points',signed:true,decimals:1,direction:'asc'},
    {id:'constant',label:'Constant',unit:'score',decimals:1,direction:'desc'},
    {id:'single',label:'Single disclosed',unit:'score',decimals:1,direction:'desc'},
    {id:'excluded',label:'Excluded comparison',unit:'score',decimals:1,direction:'desc',highlightBest:false},
    {id:'unknown',label:'Undisclosed',unit:'score',decimals:1,direction:'desc'},
  ];
  const def={id:'browser-fixture',primaryMetric:'quality',metrics,keyMetricIds:metrics.map(metric=>metric.id),categories:[{id:'static',name:'Static',criterion:'Fixture task passed.'}]};
  info.definitions.push(def);
  const providers=reports.find(report=>report.benchmarks[0].id===info.id).benchmarks[0].providers.slice(0,4).map((provider,index)=>({
    id:provider.id,name:provider.name,description:'',mode:'fixture',passed:[2,2,null,0][index],categoryPassed:{static:[2,2,null,0][index]},
    scores:Object.fromEntries(metrics.map((metric,mi)=>[metric.id,[[0,0,-2,null],[0,-1,2,null],[4,4,4,null],[null,null,7,null],[2,3,1,null],[null,null,null,null]][mi][index]])),
  }));
  const result={id:info.id,definitionId:def.id,taskCount:4,categoryTotals:{static:4},providers,notes:[]};
  const snapshot={id:`${info.id}-v99.0.0`,version:'v99.0.0',datasetDifference:'Browser regression fixture.',benchmarks:[result]};
  await page.route('**/benchmarks/catalog.json*',route=>route.fulfill({json:fixtureCatalog}));
  await page.route('**/results/reports.json*',route=>route.fulfill({json:[{file:`${info.id}/${snapshot.id}-report.json`,report:snapshot}]}));
  for(const mode of ['ranked','reported','diagnostic']) {
    def.rankable=mode!=='diagnostic';
    if(mode==='reported')def.comparisonMode='reported';else delete def.comparisonMode;
    await open(page,`/?benchmark=${info.id}&version=${snapshot.version}`,testInfo.project.metadata.language);
    const columns=benchmarkColumns(info,result,false),primary=columns[0];
    await inspect(page,providers,columns,primary,primary.direction,false,language);
    await sortEach(page,providers,columns,primary,false,language);
    if(mode==='diagnostic')await expect(page.locator('.rank-cell')).toHaveCount(0);
  }
});


test('all overviews retain every published chart and keep wide-screen selectors beside the charts',async({page},testInfo)=>{
  await page.setViewportSize({width:3840,height:1500});
  for(const [track,layer] of [['webfetch','L1'],['websearch','L1'],['websearch','L2'],['websearch','L3'],['webextract','L1'],['trajectory-replay','L1'],['browser-use','L1']]) {
    await open(page,`/?track=${track}&layer=${layer}`,testInfo.project.metadata.language);
    const included=catalog.benchmarks.filter(info=>info.trackId===track&&(!info.outputLayer||info.outputLayer===layer));
    const headings=await page.locator('.benchmark-comparisons h2').allTextContents();
    expect(headings).toEqual(included.map(info=>info.name.replace(/^LexBench /,'')));
    const charts=await page.locator('.benchmark-comparisons').boundingBox(),selector=await page.locator('.overview-chart-layout > .method-selector').boundingBox();
    expect(selector.x-(charts.x+charts.width)).toBeLessThanOrEqual(20);
    expect(selector.x).toBeGreaterThanOrEqual(charts.x+charts.width);
    await expect(page.locator('tbody tr:first-child .rank-cell')).toHaveText('1');
    const expected=overview(catalog.tracks.find(info=>info.id===track),layer);
    const firstCell=page.locator('tbody tr:first-child td.numeric').first();
    if(expectedWinner(expected.rows,expected.columns[0])===null)await expect(firstCell).not.toHaveCSS('background-color',winnerBackground);
    else await expect(firstCell).toHaveCSS('background-color',winnerBackground);
  }
});
