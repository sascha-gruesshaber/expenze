import { TrendingUp, TrendingDown, AlertCircle, Sparkles } from 'lucide-react';
import { fmt } from '../../lib/format';
import type { MonthlyData, CategoryData } from '../../api/hooks';

interface SpendingInsightsProps {
  monthly: MonthlyData[];
  categories: CategoryData[];
  income: number;
  expenses: number;
}

interface Insight {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'green' | 'red' | 'amber' | 'blue';
}

const colorClasses = {
  green: 'bg-accent/6 text-accent',
  red: 'bg-exp-red/6 text-exp-red',
  amber: 'bg-exp-amber/6 text-exp-amber',
  blue: 'bg-exp-blue/6 text-exp-blue',
};

export function SpendingInsights({ monthly, categories, income, expenses }: SpendingInsightsProps) {
  const insights: Insight[] = [];

  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
  if (savingsRate > 20) {
    insights.push({
      icon: <Sparkles size={15} />,
      title: 'Starke Sparquote',
      description: `Du sparst ${savingsRate.toFixed(0)}% deiner Einnahmen — gut gemacht!`,
      color: 'green',
    });
  } else if (savingsRate > 0) {
    insights.push({
      icon: <AlertCircle size={15} />,
      title: 'Sparquote ausbaufähig',
      description: `Nur ${savingsRate.toFixed(0)}% Sparquote. Versuche 20% anzustreben.`,
      color: 'amber',
    });
  } else if (income > 0) {
    insights.push({
      icon: <AlertCircle size={15} />,
      title: 'Negativer Cashflow',
      description: `Ausgaben übersteigen Einnahmen um ${fmt(expenses - income)}.`,
      color: 'red',
    });
  }

  if (monthly.length >= 2) {
    const last = monthly[monthly.length - 1];
    const prev = monthly[monthly.length - 2];
    const expChange = ((Number(last.expenses) - Number(prev.expenses)) / Number(prev.expenses)) * 100;

    if (expChange > 10) {
      insights.push({
        icon: <TrendingUp size={15} />,
        title: 'Ausgaben gestiegen',
        description: `${expChange.toFixed(0)}% mehr als im Vormonat (${fmt(Number(last.expenses) - Number(prev.expenses))}).`,
        color: 'red',
      });
    } else if (expChange < -10) {
      insights.push({
        icon: <TrendingDown size={15} />,
        title: 'Ausgaben gesunken',
        description: `${Math.abs(expChange).toFixed(0)}% weniger als im Vormonat — weiter so!`,
        color: 'green',
      });
    }
  }

  if (categories.length > 0) {
    const top = categories[0];
    const topPct = expenses > 0 ? (Number(top.total) / expenses) * 100 : 0;
    if (topPct > 30) {
      insights.push({
        icon: <AlertCircle size={15} />,
        title: `${top.category} dominiert`,
        description: `${topPct.toFixed(0)}% aller Ausgaben (${fmt(Number(top.total))}) gehen hierhin.`,
        color: 'amber',
      });
    }
  }

  const totalTx = categories.reduce((s, c) => s + Number(c.count), 0);
  if (totalTx > 0 && expenses > 0) {
    const avg = expenses / totalTx;
    insights.push({
      icon: <Sparkles size={15} />,
      title: 'Durchschnitt pro Buchung',
      description: `${fmt(avg)} bei ${totalTx} Transaktionen.`,
      color: 'blue',
    });
  }

  if (!insights.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {insights.slice(0, 4).map((insight, i) => (
        <div
          key={i}
          className={`flex items-start gap-3 p-3.5 rounded-xl ${colorClasses[insight.color]} transition-all`}
        >
          <div className="mt-0.5 flex-shrink-0">{insight.icon}</div>
          <div>
            <div className="text-[12px] font-semibold font-heading">{insight.title}</div>
            <div className="text-[11px] opacity-70 mt-0.5 leading-relaxed">{insight.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
