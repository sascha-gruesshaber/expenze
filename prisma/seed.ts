import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_RULES = [
  { pattern: 'REWE|LIDL|ALDI|NETTO|KAUFLAND|EDEKA|PENNY|NORMA|MH MULLER|MUELLER', category: 'Lebensmittel & Einkauf' },
  { pattern: 'FRESSNAPF|Tierhandlung', category: 'Haustier' },
  { pattern: 'VPV|VERSICHERUNG|ALLIANZ|HUK|ARAG|AXA|ERGO', category: 'Versicherung' },
  { pattern: 'LECHWERKE|LEW Verteilnetz|energie schwaben|GAS Abschlag', category: 'Energie & Nebenkosten' },
  { pattern: 'PHOTOVOLTAIK|Einspeisung', category: 'Einspeisung Photovoltaik' },
  { pattern: 'TELEKOM|VODAFONE|O2 |INTERNET', category: 'Telefon & Internet' },
  { pattern: 'APOTHEKE|ARZT|KRANKENHAUS', category: 'Gesundheit' },
  { pattern: 'Grundsteuer|Gemeinde Buttenwiesen', category: 'Steuern & Abgaben' },
  { pattern: 'Teilzahlung Darlehen|Darlehen', category: 'Kredit & Darlehen' },
  { pattern: 'Haushaltsgeld|Haushaltskonto', category: 'Haushalt' },
  { pattern: 'AMAZON|EBAY|PAYPAL|ZALANDO|OTTO', category: 'Online Shopping' },
  { pattern: 'TANKSTELLE|ARAL|SHELL|BP|ESSO', category: 'Kraftstoff' },
  { pattern: 'BAHN|FLUG|LUFTHANSA|TAXI|UBER', category: 'Reise & Verkehr' },
  { pattern: 'Kontoführung|Abschluss', category: 'Bankgebühren' },
  { pattern: 'Aufrundkonto|Aufrundung|Sparrate|Sparen\\s', category: 'Sparen' },
];

async function main() {
  const existing = await prisma.categoryRule.count();
  if (existing > 0) {
    console.log(`Skipping seed: ${existing} rules already exist`);
    return;
  }

  for (let i = 0; i < DEFAULT_RULES.length; i++) {
    const rule = DEFAULT_RULES[i];
    await prisma.categoryRule.create({
      data: {
        category: rule.category,
        pattern: rule.pattern,
        match_field: 'description',
        match_type: 'regex',
        priority: (i + 1) * 10,
        is_default: true,
        created_at: new Date().toISOString(),
      },
    });
  }
  console.log(`Seeded ${DEFAULT_RULES.length} default category rules`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
