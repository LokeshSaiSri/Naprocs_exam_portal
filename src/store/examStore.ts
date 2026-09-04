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
  mediaStream: MediaStream | null;

  // Actions
  login: (candidate: Candidate) => void;
  logout: () => void;
  setQuestions: (questions: Question[]) => void;
  setCurrentQuestionIndex: (index: number) => void;
  setAnswer: (questionId: string, answer: any) => void;
  setFullscreen: (val: boolean) => void;
  incrementCheatWarning: () => void;
  setMediaStream: (stream: MediaStream | null) => void;
}

export const useExamStore = create<ExamState>((set) => ({
  candidate: null,
  isAuthenticated: false,
  questions: [],
  currentQuestionIndex: 0,
  answers: {},
  isFullscreen: false,
  cheatWarnings: 0,
  mediaStream: null,

  login: (candidate) => {
    set({ candidate, isAuthenticated: true });
  },

  logout: () => set((state) => {
    // Belt-and-suspenders: the dashboard already stops its own tracks before
    // calling logout(), but a stream must never outlive the session it was
    // granted for -- stopping it again here is a harmless no-op if already
    // stopped, and a real cleanup if some other exit path forgot to.
    state.mediaStream?.getTracks().forEach((t) => t.stop());
    return {
      candidate: null,
      isAuthenticated: false,
      answers: {},
      currentQuestionIndex: 0,
      cheatWarnings: 0,
      questions: [],
      mediaStream: null,
    };
  }),

  setQuestions: (questions) => set({ questions }),
  setCurrentQuestionIndex: (index) => set({ currentQuestionIndex: index }),
  setAnswer: (questionId, answer) =>
    set((state) => ({
      answers: { ...state.answers, [questionId]: answer }
    })),
  setFullscreen: (val) => set({ isFullscreen: val }),
  incrementCheatWarning: () => set((state) => ({ cheatWarnings: state.cheatWarnings + 1 })),
  setMediaStream: (stream) => set({ mediaStream: stream }),
}));
