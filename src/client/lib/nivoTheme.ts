import type { Theme } from '@nivo/core';

export const nivoTheme: Theme = {
  text: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontSize: 12,
    fill: '#78716C',
  },
  tooltip: {
    container: {
      background: '#FFFFFF',
      color: '#1C1917',
      fontSize: 12,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      borderRadius: '10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
      padding: '8px 12px',
      border: '1px solid #E5E3DC',
    },
  },
  labels: {
    text: {
      fontFamily: '"DM Sans", system-ui, sans-serif',
      fontSize: 12,
      fill: '#1C1917',
      fontWeight: 600,
    },
  },
};

export const CHART_COLORS = [
  '#0D9373', // accent green
  '#4A7AE5', // blue
  '#DC5944', // red
  '#D4930D', // amber
  '#7C5CDB', // purple
  '#E07B53', // coral
  '#3BA0A8', // teal
  '#A85C9E', // mauve
  '#6B9E42', // olive
  '#C7633D', // burnt orange
];

export const INCOME_COLORS = [
  '#0D9373',
  '#10B981',
  '#34D399',
  '#6EE7B7',
  '#A7F3D0',
  '#22C55E',
  '#16A34A',
  '#15803D',
  '#4ADE80',
  '#86EFAC',
];

export const ACCOUNT_COLOR = '#4A7AE5';

export const CALENDAR_COLORS = ['#F0EFEB', '#B8E6D9', '#6FCFB5', '#34B893', '#0D9373'];

export function fmtEuro(v: number): string {
  return v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
