import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  driveTitle: string;
  examDuration: number; // In minutes
  passingCutoff: number; // Percent
  proctoringSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  maxCheatWarnings: number;
  mcqCount: number;
  codingCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  isExamActive: boolean;
  startTime?: Date;
  endTime?: Date;
}

const SettingsSchema: Schema = new Schema({
  driveTitle: { type: String, default: "Naprocs Recruitment Drive" },
  examDuration: { type: Number, default: 60 },
  passingCutoff: { type: Number, default: 70 },
  proctoringSensitivity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  maxCheatWarnings: { type: Number, default: 3 },
  mcqCount: { type: Number, default: 15 },
  codingCount: { type: Number, default: 2 },
  shuffleQuestions: { type: Boolean, default: true },
  shuffleOptions: { type: Boolean, default: true },
  isExamActive: { type: Boolean, default: true },
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },
  passwordsResetAt: { type: Date, default: null },
}, { timestamps: true });

// Ensure we only ever have ONE settings document
export default mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);
