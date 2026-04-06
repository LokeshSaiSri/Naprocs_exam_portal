import { create } from 'zustand';

interface Candidate {
  id: string;
  name: string;
  email: string;
  pin: string;
  collegeRollNumber: string;
}

export interface Question {
  _id: string;
  id?: string;
  type: 'MCQ' | 'CODING';
  title: string;
  content?: string;
  description?: string;
  options?: string[]; // For MCQ mode
  boilerplateCode?: string; // For Coding mode
  language?: string; // For Coding mode
  testCases?: any[];
}

interface ExamState {
  candidate: Candidate | null;
  isAuthenticated: boolean;
  questions: Question[];
  currentQuestionIndex: number;
  answers: Record<string, any>; 
  isFullscreen: boolean;
  cheatWarnings: number;
  
  // Actions
  login: (candidate: Candidate) => void;
  logout: () => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswer: (questionId: string, answer: any) => void;
  setFullscreen: (val: boolean) => void;
  incrementCheatWarning: () => void;
}

export const useExamStore = create<ExamState>((set) => ({
  candidate: null,
  isAuthenticated: false,
  questions: [],
  currentQuestionIndex: 0,
  answers: {},
  isFullscreen: false,
  cheatWarnings: 0,

  login: (candidate) => {
    set({ candidate, isAuthenticated: true });
  },

  logout: () => set({ 
    candidate: null, 
    isAuthenticated: false, 
    answers: {}, 
    currentQuestionIndex: 0, 
    cheatWarnings: 0,
    questions: []
  }),
  
  setQuestions: (questions) => set({ questions }),
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  setAnswer: (questionId, answer) => 
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer }
    })),
  setFullscreen: (val) => set({ isFullscreen: val }),
  incrementCheatWarning: () => set((state) => ({ cheatWarnings: state.cheatWarnings + 1 }))
}));
