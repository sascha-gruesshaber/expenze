import { ResponsiveSankey } from '@nivo/sankey';
import { nivoTheme, INCOME_COLORS, ACCOUNT_COLOR, CHART_COLORS, fmtEuro } from '../../lib/nivoTheme';
import { useFlowAnalysis } from '../../api/hooks';
import { useFilters } from '../../lib/filterContext';

export function SankeyChart() {
  const { filters } = useFilters();
  const { data, isLoading } = useFlowAnalysis(filters);

  if (isLoading) {
    return <div className="h-[400px] flex items-center justify-center"><span className="spinner" />Lade Geldfluss...</div>;
  }

  if (!data || data.nodes.length === 0) {
    return <div className="h-[400px] flex items-center justify-center text-text-3 text-sm">Keine Daten</div>;
  }

  const colorMap: Record<string, string> = {};
  for (const node of data.nodes) {
    colorMap[node.id] = node.color;
  }

  return (
    <div className="h-[400px]">
      <ResponsiveSankey
        data={data}
        theme={nivoTheme}
        margin={{ top: 20, right: 220, bottom: 20, left: 220 }}
        align="justify"
        label={(node: any) => {
          const lbl = node.label || node.id;
          return lbl.length > 30 ? lbl.substring(0, 30) + '…' : lbl;
        }}
        colors={(node: any) => colorMap[node.id] || '#A8A29E'}
        nodeOpacity={1}
        nodeHoverOthersOpacity={0.35}
        nodeThickness={18}
        nodeSpacing={14}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        linkOpacity={0.25}
        linkHoverOthersOpacity={0.1}
        linkContract={2}
        linkBlendMode="normal"
        enableLinkGradient
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={12}
        labelTextColor={{ from: 'color', modifiers: [['darker', 1.2]] }}
        nodeTooltip={({ node }: any) => (
          <div className="bg-white border border-border rounded-xl px-3 py-2 shadow-lg text-[12px]">
            <strong>{node.label}</strong>
            <div className="text-text-2">{fmtEuro(node.value)}</div>
          </div>
        )}
        linkTooltip={({ link }: any) => (
          <div className="bg-white border border-border rounded-xl px-3 py-2 shadow-lg text-[12px]">
            <span>{link.source.label}</span>
            <span className="text-text-3 mx-1">&rarr;</span>
            <span>{link.target.label}</span>
            <div className="text-text-2 font-medium">{fmtEuro(link.value)}</div>
          </div>
        )}
      />
    </div>
  );
}
