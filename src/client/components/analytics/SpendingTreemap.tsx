import { ResponsiveTreeMap } from '@nivo/treemap';
import { nivoTheme, CHART_COLORS, fmtEuro } from '../../lib/nivoTheme';
import { useCategories } from '../../api/hooks';
import { useFilters } from '../../lib/filterContext';

export function SpendingTreemap() {
  const { filters } = useFilters();
  const { data: categories = [], isLoading } = useCategories({ ...filters, direction: 'debit' });

  if (isLoading) {
    return <div className="h-[320px] flex items-center justify-center"><span className="spinner" />Lade Kategorien...</div>;
  }

  const filtered = categories.filter(c => c.total > 0 && c.category_type !== 'savings');
  if (filtered.length === 0) {
    return <div className="h-[320px] flex items-center justify-center text-text-3 text-sm">Keine Daten</div>;
  }

  const treeData = {
    name: 'Ausgaben',
    children: filtered.map((c, i) => ({
      name: c.category,
      value: Math.round(c.total * 100) / 100,
      color: CHART_COLORS[i % CHART_COLORS.length],
    })),
  };

  return (
    <div className="h-[320px]">
      <ResponsiveTreeMap
        data={treeData}
        theme={nivoTheme}
        identity="name"
        value="value"
        valueFormat=" >-.0f"
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        labelSkipSize={40}
        label={(node: any) => `${node.id}`}
        labelTextColor={{ from: 'color', modifiers: [['darker', 2.5]] }}
        enableParentLabel={false}
        colors={(node: any) => node.data.color || '#A8A29E'}
        borderWidth={2}
        borderColor="#FFFFFF"
        nodeOpacity={0.9}
        innerPadding={3}
        outerPadding={2}
        borderRadius={6}
        tooltip={({ node }: any) => (
          <div className="bg-white border border-border rounded-xl px-3 py-2 shadow-lg text-[12px]">
            <strong>{node.id}</strong>
            <div className="text-text-2">{fmtEuro(node.value)}</div>
          </div>
        )}
      />
    </div>
  );
}
