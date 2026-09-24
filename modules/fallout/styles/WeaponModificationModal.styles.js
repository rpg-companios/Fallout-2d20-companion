import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  closeButton: { padding: 5 },
  closeButtonText: { fontSize: 20, color: '#666' },
  modalBody: { padding: 15 },
  weaponInfo: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5,
  },
  weaponTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  weaponStats: { fontSize: 12, color: '#666' },
  modificationsSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  collapsibleSection: { marginBottom: 10 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  expandIcon: { fontSize: 16, color: '#666' },
  sectionContent: { paddingLeft: 10, paddingTop: 5 },
  // 352/353: строка мода — тап по текстам выбирает мод; кнопка «Создать» —
  // компактная справа в строке материалов (макет владельца), стиль — аналог
  // applyButton этой же модалки (#007AFF, borderRadius 5).
  modItemMain: { flex: 1 },
  createButton: {
    // 355 (замечание владельца): зелёная — rgb(34, 197, 94) из стилей
    // (PerkSelectModal.styles #22c55e); синяя была ошибкой 353.
    backgroundColor: '#22c55e',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
  },
  createButtonDimmed: { opacity: 0.4 },
  createButtonText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  modificationRequirements: { fontSize: 12, fontWeight: '600', color: '#333', marginTop: 4 },
  requirementsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  requirementsMaterials: { flex: 1, fontSize: 11, color: '#555' },
  modificationItem: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 5,
  },
  selectedModification: { borderColor: '#007AFF', backgroundColor: '#f0f8ff' },
  modificationName: { fontSize: 14, fontWeight: 'bold' },
  modificationCategory: { fontSize: 12, color: '#666', marginTop: 2 },
  modificationEffects: {
    fontSize: 12,
    color: '#333',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  modificationStats: { fontSize: 11, color: '#666', marginTop: 3 },
  previewSection: { marginBottom: 20 },
  previewContent: { padding: 10, backgroundColor: '#e8f5e8', borderRadius: 5 },
  previewTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 5 },
  previewStats: { fontSize: 12, color: '#666', marginBottom: 5 },
  previewEffects: { fontSize: 12, color: '#333', marginBottom: 2 },
  previewQualities: { fontSize: 12, color: '#333' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelButton: {
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  cancelButtonText: { color: '#666' },
  applyButton: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
    flex: 1,
    alignItems: 'center',
  },
  disabledButton: { backgroundColor: '#ccc' },
  applyButtonText: { color: 'white', fontWeight: 'bold' },

  // 357: диалог отчёта о крафте — как окно количества в окне крафта (318).
  reportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  reportDialog: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#5a5a5a', padding: 16, width: '100%' },
  reportTitle: { color: '#000', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  // 363: зелёная отметка применения (вопросы/отказы — AlertHost, 364).
  installNote: { color: '#16a34a', fontSize: 12, textAlign: 'center', paddingVertical: 6 },
});

export default styles;
