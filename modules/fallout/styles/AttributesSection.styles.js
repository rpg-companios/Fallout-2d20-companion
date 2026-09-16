import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5a5a5a',
  },
  sectionHeader: {
    backgroundColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  pointsHint: {
    color: '#f0e68c',
    fontSize: 11,
    textAlign: 'right',
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#1a1a1a',
  },
  attributeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  attributeName: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  attributeValue: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
    minWidth: 30,
    textAlign: 'center',
  },
  compactCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
  },
  counterButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#000',
  },
  counterButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#e9ecef',
    borderColor: '#ced4da',
  },
  disabledText: {
    color: '#adb5bd',
  },
  counterValue: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
    marginHorizontal: 4,
    minWidth: 20,
    textAlign: 'center',
  },
  buttonsContainer: {
    flexDirection: 'column',
    padding: 10,
  },
  button: {
    width: '100%',
    paddingVertical: 8,
    marginVertical: 5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  resetButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
});

export default styles;
