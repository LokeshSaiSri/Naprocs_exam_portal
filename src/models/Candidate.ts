import mongoose, { Schema, Document } from "mongoose";

export interface ICandidate extends Document {
  name: string;
  email: string;
  phone: string;
  collegeRollNumber: string;
  resumeUrl?: string;
  accessPin: string;
  examScore: number;
  stage: 'EXAM_PENDING' | 'EXAM_COMPLETED' | 'TECH_ROUND' | 'HR_ROUND' | 'SELECTED' | 'REJECTED';
  techNotes?: string;
  hrNotes?: string;
  lastActiveAt?: Date;
  currentSessionId?: string;
  scoreLogic?: number;
  scoreArchitecture?: number;
  scoreLinguistic?: number;
  scoreMission?: number;
  cheatWarnings?: number;
  driveId: mongoose.Types.ObjectId;
}

const CandidateSchema = new Schema<ICandidate>(
  {
    driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    collegeRollNumber: { type: String, required: true, unique: true },
    resumeUrl: { type: String },
    accessPin: { type: String, required: true },
    examScore: { type: Number, default: 0 },
    stage: {
      type: String,
      enum: ['EXAM_PENDING', 'EXAM_COMPLETED', 'TECH_ROUND', 'HR_ROUND', 'SELECTED', 'REJECTED'],
      default: 'EXAM_PENDING',
    },
    techNotes: { type: String },
    hrNotes: { type: String },
    lastActiveAt: { type: Date },
    currentSessionId: { type: String },
    scoreLogic: { type: Number, default: 0 },
    scoreArchitecture: { type: Number, default: 0 },
    scoreLinguistic: { type: Number, default: 0 },
    scoreMission: { type: Number, default: 0 },
    cheatWarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Candidate || mongoose.model<ICandidate>("Candidate", CandidateSchema);
