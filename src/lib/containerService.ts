import { db } from './firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp 
} from 'firebase/firestore';

export interface CanvasContainer {
  id: string;
  userId: string;
  type: 'blob' | 'collapsible';
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  color: string;
  subtle?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export const containerService = {
  async save(userId: string, data: Omit<CanvasContainer, 'id' | 'userId'>) {
    const docRef = await addDoc(collection(db, 'canvasContainers'), {
      ...data,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef;
  },

  async update(id: string, changes: Partial<Omit<CanvasContainer, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) {
    await updateDoc(doc(db, 'canvasContainers', id), {
      ...changes,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(id: string) {
    await deleteDoc(doc(db, 'canvasContainers', id));
  }
};
