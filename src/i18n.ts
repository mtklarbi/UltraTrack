import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  fr: {
    translation: {
      app: { title: 'SemDiff' },
      nav: { home: 'Accueil', dashboard: 'Tableau de bord', settings: 'Paramètres' },
      search: { students: 'Rechercher des élèves…' },
      common: {
        add_note: 'Ajouter une note',
        history: 'Historique',
        scales: 'Échelles',
        ratings: 'Évaluations',
        notes: 'Notes',
        export_pdf: 'Exporter PDF',
        saved: 'Enregistré',
        students: 'Élèves',
        loading: 'Chargement…',
        no_students: 'Aucun élève trouvé.',
        class: 'Classe',
        scale: 'Échelle',
        legend: 'Légende',
        all: 'Tous',
        download_pdf: 'Télécharger PDF',
        add: 'Ajouter',
        cancel: 'Annuler',
        save: 'Enregistrer',
        edit: 'Modifier',
        delete: 'Supprimer',
      },
      settings: {
        scales: 'Échelles',
        add_scale: 'Ajouter une échelle',
        left_label: 'Libellé gauche',
        right_label: 'Libellé droite',
        min: 'Min',
        max: 'Max',
        range: 'Plage',
        csv_export: 'Export CSV',
        csv_import: 'Import CSV',
        import_students: 'Importer students.csv',
        import_ratings: 'Importer ratings.csv',
        merge_duplicates: 'Fusionner les doublons',
        skip_duplicates: 'Ignorer les doublons',
        optional_id: 'ID optionnel (slug)',
      },
      student: {
        last_10: 'Derniers 10',
      },
      dashboard: {
        class_average: 'Moyenne de la classe',
        top_improvements: 'Meilleures progressions (7 jours)',
        largest_drops: 'Plus fortes baisses (7 jours)',
      },
      scales: {
        interesse: { left: 'Intéressé', right: 'Pas intéressé' },
        motivant: { left: 'Motivant', right: 'Démotivant' },
        stimulant: { left: 'Stimulant', right: 'Ennuyeux' },
        actif: { left: 'Actif', right: 'Paresseux' },
        perseverance: { left: 'Persévérance', right: 'Abandon' },
        soigneux: { left: 'Soigneux', right: 'Négligent' },
        autonome: { left: 'Autonome', right: 'Dépendant' },
        respectueux: { left: 'Respectueux', right: 'Irrespectueux' },
      },
      locale: { fr: 'FR', ar: 'AR' },
    },
  },
  ar: {
    translation: {
      app: { title: 'سيم ديف' },
      nav: { home: 'الرئيسية', dashboard: 'لوحة المعلومات', settings: 'الإعدادات' },
      search: { students: 'بحث عن التلاميذ…' },
      common: {
        add_note: 'إضافة ملاحظة',
        history: 'السجل',
        scales: 'المقاييس',
        ratings: 'التقييمات',
        notes: 'ملاحظات',
        export_pdf: 'تصدير PDF',
        saved: 'تم الحفظ',
        students: 'التلاميذ',
        loading: 'جارٍ التحميل…',
        no_students: 'لا يوجد تلاميذ.',
        class: 'القسم',
        scale: 'المقياس',
        legend: 'المفتاح',
        all: 'الكل',
        download_pdf: 'تحميل PDF',
        add: 'إضافة',
        cancel: 'إلغاء',
        save: 'حفظ',
        edit: 'تحرير',
        delete: 'حذف',
      },
      settings: {
        scales: 'المقاييس',
        add_scale: 'إضافة مقياس',
        left_label: 'التسمية اليسرى',
        right_label: 'التسمية اليمنى',
        min: 'الحد الأدنى',
        max: 'الحد الأقصى',
        range: 'النطاق',
        csv_export: 'تصدير CSV',
        csv_import: 'استيراد CSV',
        import_students: 'استيراد students.csv',
        import_ratings: 'استيراد ratings.csv',
        merge_duplicates: 'دمج المكررات',
        skip_duplicates: 'تخطي المكررات',
        optional_id: 'معرّف اختياري',
      },
      student: {
        last_10: 'آخر 10',
      },
      dashboard: {
        class_average: 'متوسط القسم',
        top_improvements: 'أكبر تحسن (7 أيام)',
        largest_drops: 'أكبر انخفاض (7 أيام)',
      },
      scales: {
        interesse: { left: 'مهتم', right: 'غير مهتم' },
        motivant: { left: 'مشجّع', right: 'محبط' },
        stimulant: { left: 'محفّز', right: 'ممل' },
        actif: { left: 'نشط', right: 'كسول' },
        perseverance: { left: 'مثابرة', right: 'تراجع' },
        soigneux: { left: 'دقيق', right: 'مهمل' },
        autonome: { left: 'مستقل', right: 'معتمد' },
        respectueux: { left: 'محترم', right: 'غير محترم' },
      },
      locale: { fr: 'فر', ar: 'عر' },
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

// Manage dir attribute on language change
const setDir = (lng: string) => {
  const dir = lng === 'ar' ? 'rtl' : 'ltr';
  if (typeof document !== 'undefined') {
    document.documentElement.dir = dir;
    document.documentElement.lang = lng;
  }
};
setDir(i18n.language);
i18n.on('languageChanged', setDir);

export default i18n;
