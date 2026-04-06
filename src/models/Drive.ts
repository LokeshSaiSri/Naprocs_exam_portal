import mongoose, { Schema, Document } from 'mongoose';

export interface IDrive extends Document {
  title: string;
  slug: string; // URL unique identifier
  examDuration: number; // In minutes
  passingCutoff: number; // Percent
  proctoringSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
  maxCheatWarnings: number;
  mcqCount: number;
  codingCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  isExamActive: boolean;
  regStart: Date;
  regEnd: Date;
  examStart: Date;
  examEnd: Date;
}

const DriveSchema: Schema = new Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  examDuration: { type: Number, default: 60 },
  passingCutoff: { type: Number, default: 70 },
  proctoringSeverity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  maxCheatWarnings: { type: Number, default: 3 },
  mcqCount: { type: Number, default: 15 },
  codingCount: { type: Number, default: 2 },
  shuffleQuestions: { type: Boolean, default: true },
  shuffleOptions: { type: Boolean, default: true },
  isExamActive: { type: Boolean, default: true },
  regStart: { type: Date, required: true },
  regEnd: { type: Date, required: true },
  examStart: { type: Date, required: true },
  examEnd: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.models.Drive || mongoose.model<IDrive>('Drive', DriveSchema);
