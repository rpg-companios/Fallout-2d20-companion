// Общие стили модалок выживания (еда/питьё/сон) на экране «Снаряжение».
// Отдельный модуль, чтобы три модалки не копировали overlay/кнопки друг у друга.

import { StyleSheet } from 'react-native';

export const survivalModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#222',
  },
  blockBanner: {
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: '#e8a33d',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  blockBannerText: {
    color: '#7a1f1f',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    paddingVertical: 16,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowName: {
    flex: 1,
    fontSize: 14,
    color: '#111',
    flexWrap: 'wrap',
  },
  rowMeta: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  rowGain: {
    fontSize: 12,
    color: '#2e7d32',
    fontWeight: '600',
  },
  rowQty: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  confirmButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  placeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  placeButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#999',
    marginHorizontal: 4,
    backgroundColor: '#eee',
  },
  placeButtonActive: {
    backgroundColor: '#e8a33d',
    borderColor: '#b07b1f',
  },
  placeButtonText: {
    fontWeight: '600',
    color: '#333',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  hoursButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  hoursValue: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  forecastBox: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#fafafa',
  },
  forecastTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 6,
    color: '#222',
  },
  forecastLine: {
    fontSize: 13,
    color: '#333',
    marginVertical: 1,
  },
  forecastLinePositive: {
    fontSize: 13,
    color: '#2e7d32',
    marginVertical: 1,
  },
  forecastLineNegative: {
    fontSize: 13,
    color: '#b71c1c',
    marginVertical: 1,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
    marginBottom: 10,
  },
});
