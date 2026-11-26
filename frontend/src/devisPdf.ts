import { COMPANY, fmt, formatPayback, type ClientInfo, type Estimate } from "./simulation";

const BLUE: [number, number, number] = [37, 99, 235];
const GREEN: [number, number, number] = [5, 150, 105];
const DARK: [number, number, number] = [29, 29, 31];
const GRAY: [number, number, number] = [107, 114, 128];

/** Génère le devis PDF dans le navigateur et lance le téléchargement. */
export async function downloadDevis(estimate: Estimate, client: ClientInfo, reference: string) {
  // Chargement à la demande : jsPDF n'alourdit pas le reste de l'application.
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const right = pageWidth - margin;
  const cur = estimate.currency;
  const { inputs, monthly, yearly, assumptions, investment } = estimate;
  const today = new Date();
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // --- En-tête ---
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, pageWidth, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(18).text(COMPANY.name, margin, 14);
  doc.setFont("helvetica", "normal").setFontSize(9).text(COMPANY.tagline, margin, 20);
  doc.setFont("helvetica", "bold").setFontSize(20).text("DEVIS", right, 14, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9)
    .text("Simulation d'économies d'énergie avec modules Shelly", right, 20, { align: "right" });

  // --- Références + client ---
  let y = 40;
  doc.setTextColor(...DARK).setFontSize(10);
  const validity = new Date(today.getTime() + 30 * 24 * 3600 * 1000);
  [
    ["Référence", reference],
    ["Date", today.toLocaleDateString("fr-FR")],
    ["Valable jusqu'au", validity.toLocaleDateString("fr-FR")],
  ].forEach(([label, value], index) => {
    doc.setFont("helvetica", "bold").text(`${label} :`, margin, y + index * 5.5);
    doc.setFont("helvetica", "normal").text(value, margin + 34, y + index * 5.5);
  });

  const clientLines = [
    client.name, client.company, client.email, client.phone,
    `${inputs.building_label} - ${inputs.city_label}`,
  ].filter((line) => line.trim() !== "");
  doc.setFont("helvetica", "bold").setTextColor(...GRAY).setFontSize(8).text("CLIENT", 120, y - 1);
  doc.setFont("helvetica", "normal").setTextColor(...DARK).setFontSize(10);
  clientLines.forEach((line, index) => doc.text(line, 120, y + 4 + index * 5, { maxWidth: right - 120 }));
  y += Math.max(3 * 5.5, 4 + clientLines.length * 5) + 6;

  const sectionTitle = (title: string, top: number) => {
    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...BLUE).text(title, margin, top);
    doc.setTextColor(...DARK);
  };
  const tableStyle = {
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 1.4, textColor: DARK },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [245, 247, 250] as [number, number, number] },
  };

  // --- 1. Installation ---
  sectionTitle("1. Votre installation", y);
  autoTable(doc, {
    ...tableStyle,
    startY: y + 3,
    head: [["Paramètre", "Valeur"]],
    body: [
      ["Type de bâtiment", inputs.building_label],
      ["Localisation / distributeur", `${inputs.city_label} - ${inputs.distributor}`],
      ["Facture d'électricité mensuelle", `${fmt(inputs.monthly_bill)} ${cur}`],
      ["Tarification", inputs.tariff_mode === "tiered"
        ? `Tranches résidentielles (prix moyen ${fmt(monthly.average_price_per_kwh, 2)} ${cur}/kWh)`
        : `Prix moyen ${fmt(inputs.price_per_kwh ?? 0, 2)} ${cur}/kWh TTC`],
      ["Consommation totale estimée", `${fmt(monthly.total_kwh, 0)} kWh/mois`],
      ["Part des appareils déclarés", `${fmt(monthly.covered_share_percent, 1)} % de la consommation`],
    ],
    columnStyles: { 0: { cellWidth: 75, fontStyle: "bold" } },
  });

  y = lastY() + 4;
  autoTable(doc, {
    ...tableStyle,
    startY: y,
    head: [["Appareil", "Qté", "Puissance", "h/jour", "kWh/mois", "Économie"]],
    body: estimate.appliances.map((a) => [
      a.label, String(a.quantity), `${fmt(a.power_w, 0)} W`, fmt(a.hours_per_day, 1),
      fmt(a.monthly_kwh, 0), `${fmt(a.savings_percent, 0)} %`,
    ]),
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  // --- 2. Résultats ---
  y = lastY() + 8;
  sectionTitle("2. Résultats de la simulation", y);
  autoTable(doc, {
    ...tableStyle,
    startY: y + 3,
    head: [["Indicateur", "Sans Shelly", "Avec Shelly", "Économie"]],
    body: [
      ["Consommation des appareils (kWh/mois)", fmt(monthly.covered_kwh, 0), fmt(monthly.covered_kwh_with_shelly, 0), fmt(monthly.saved_kwh, 0)],
      [`Facture mensuelle (${cur})`, fmt(monthly.bill_without_shelly), fmt(monthly.bill_with_shelly), fmt(monthly.saved_cost)],
      [`Facture annuelle (${cur})`, fmt(yearly.bill_without_shelly), fmt(yearly.bill_with_shelly), fmt(yearly.saved_cost)],
    ],
    columnStyles: {
      0: { cellWidth: 75, fontStyle: "bold" },
      1: { halign: "right" }, 2: { halign: "right" },
      3: { halign: "right", fontStyle: "bold", textColor: GREEN },
    },
  });

  // Encadré de synthèse
  y = lastY() + 6;
  doc.setFillColor(236, 253, 245).setDrawColor(...GREEN);
  doc.roundedRect(margin, y, right - margin, 20, 2, 2, "FD");
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...GREEN)
    .text(`Économie estimée : ${fmt(yearly.saved_cost)} ${cur} par an`, margin + 5, y + 8);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...DARK)
    .text(
      `Soit -${fmt(monthly.bill_reduction_percent, 1)} % sur votre facture, ${fmt(yearly.saved_kwh, 0)} kWh `
      + `et environ ${fmt(yearly.co2_avoided_kg, 0)} kg de CO2 évités chaque année.`,
      margin + 5, y + 15,
    );

  // --- 3. Prestation ---
  y += 28;
  sectionTitle("3. Prestation proposée", y);
  autoTable(doc, {
    ...tableStyle,
    startY: y + 3,
    head: [["Priorité", "Désignation", "Modules", `Estimation (${cur})`, "Retour"]],
    body: [
      ...[...estimate.appliances].sort((a, b) => a.priority - b.priority).map((a) => [
        String(a.priority), `${a.module} - ${a.label}`, String(a.modules), fmt(a.investment, 0), formatPayback(a.payback_months),
      ]),
      ["", "Visite technique et relevé des circuits", "1", "Sur devis", ""],
      [{ content: "Total estimé (modules + pose)", colSpan: 2, styles: { fontStyle: "bold" as const } },
        String(investment.modules), fmt(investment.total, 0), formatPayback(investment.payback_months)],
    ],
    columnStyles: { 0: { halign: "center", cellWidth: 18 }, 2: { halign: "center", cellWidth: 20 }, 3: { halign: "right", cellWidth: 32 }, 4: { halign: "right", cellWidth: 28 } },
  });
  y = lastY() + 5;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...DARK);
  const offer = doc.splitTextToSize(
    `Gain net estimé sur ${investment.years} ans : ${fmt(investment.net_gain, 0)} ${cur}. `
    + "Les prix sont indicatifs ; le prix définitif sera fixé avec vous après une visite technique. "
    + `Pour donner suite à cette simulation, contactez-nous : ${COMPANY.email} - ${COMPANY.phone}.`,
    right - margin,
  );
  doc.text(offer, margin, y);
  y += offer.length * 4.2 + 4;

  // --- 4. Hypothèses ---
  const hypotheses = [
    `Taux d'économie de référence : ${fmt(assumptions.reference_savings_percent, 1)} %, issu de la comparaison `
    + "avec / sans Shelly du jeu de données ENSA Fès (données simulées).",
    `Coefficient appliqué au type "${inputs.building_label}" : ${fmt(assumptions.savings_factor, 2)}, `
    + `soit ${fmt(assumptions.lighting_savings_percent, 1)} % d'économie sur l'éclairage.`,
    "Autres appareils : taux d'économie indicatifs (programmation horaire, coupure hors occupation, suppression de la veille).",
    "Les usages électriques non déclarés ne sont pas modifiés.",
    inputs.tariff_mode === "tiered"
      ? `Tarif : grille résidentielle ONEE (progressive jusqu'à 150 kWh/mois, sélective au-delà : toute la consommation au prix de la tranche atteinte), TVA ${fmt((assumptions.tariff_tax_rate ?? 0) * 100, 0)} %, hors redevances fixes. Tranche ${monthly.tranche_without_shelly} sans Shelly, ${monthly.tranche_with_shelly} avec Shelly.`
      : `Prix du kWh : moyenne indicative TTC (${inputs.distributor}), hors redevances fixes.`,
    `Module Shelly : ${fmt(inputs.module_price, 0)} ${cur}, pose : ${fmt(inputs.installation_price, 0)} ${cur} par module (indicatif) ; CO2 : ${fmt(assumptions.co2_kg_per_kwh, 2)} kg/kWh (indicatif).`,
  ];
  const lines = hypotheses.flatMap((text) => doc.setFontSize(8).splitTextToSize(`- ${text}`, right - margin) as string[]);
  if (y + 6 + (lines.length - 1) * 3.6 > pageHeight - 19) { doc.addPage(); y = 20; }
  sectionTitle("4. Hypothèses de calcul", y);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRAY).text(lines, margin, y + 6, { lineHeightFactor: 1.25 });

  // --- Pied de page ---
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(229, 231, 235).line(margin, pageHeight - 16, right, pageHeight - 16);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GRAY);
    doc.text(`${COMPANY.name} - ${COMPANY.address} - ${COMPANY.email} - ${COMPANY.phone}`, margin, pageHeight - 11);
    doc.text(
      "Document non contractuel : estimation fondée sur les informations déclarées par le client.",
      margin, pageHeight - 7,
    );
    doc.text(`${page}/${pages}`, right, pageHeight - 7, { align: "right" });
  }

  doc.save(`Devis_${reference}.pdf`);
}
