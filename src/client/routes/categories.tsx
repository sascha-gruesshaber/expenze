import { createFileRoute } from '@tanstack/react-router';
import { CategoryOverviewTable } from '../components/categories/CategoryOverviewTable';

export const Route = createFileRoute('/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading font-bold text-[20px] text-text">Kategorien</h1>
        <p className="text-[13px] text-text-3 mt-1">Kategorien und Regeln für automatische Zuordnung verwalten</p>
      </div>
      <CategoryOverviewTable />
    </div>
  );
}
