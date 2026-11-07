// Создано tools/build-native-validators.cjs; вручную не менять.
type Validator = ((value: unknown) => boolean) & {errors?: readonly unknown[] | null};
export const infoCourse: Validator;
export const infoCourseInstance: Validator;
export const infoAssessment: Validator;
export const infoQuestion: Validator;
