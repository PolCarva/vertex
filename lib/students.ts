export type StudentUser = {
  username: string;
  password: string;
  displayName: string;
};

const STUDENTS: StudentUser[] = [
  { username: "acosta", password: "328063", displayName: "Anaclara Acosta Giribaldi" },
  { username: "brito", password: "314948", displayName: "Sofía Brito Caresani" },
  { username: "bustamante", password: "302421", displayName: "Juan Ignacio Bustamante Corrales" },
  { username: "cabot", password: "325297", displayName: "Diego Cabot Díaz" },
  { username: "carvalho", password: "269215", displayName: "Carvalho" },
  { username: "conde", password: "309014", displayName: "Bruno Conde Román" },
  { username: "correa", password: "327600", displayName: "Martina Clara Correa Lucero" },
  { username: "estefan", password: "309258", displayName: "Avril Estefan Di Landro" },
  { username: "fernandez", password: "282833", displayName: "Franco Alejandro Fernandez López" },
  { username: "furtado", password: "306209", displayName: "Santiago Marcel Furtado Sabatini" },
  { username: "garcia", password: "328874", displayName: "Joaquina Garcia Milicevic" },
  { username: "genova", password: "272120", displayName: "Mateo Génova Affonso" },
  { username: "gomensoro", password: "322657", displayName: "Carmen María Gomensoro Hounie" },
  { username: "gonzalez", password: "329320", displayName: "Ivan Gonzalez Elizalde" },
  { username: "ibarburu", password: "323492", displayName: "Ismael Ibarburu Techera" },
  { username: "laufer", password: "282325", displayName: "Dafna Laufer Alexandrovich" },
  { username: "levy", password: "281737", displayName: "Micaela Valentina Levy Polak" },
  { username: "martusciello", password: "330535", displayName: "Sofía Martusciello Coitiño" },
  { username: "oton", password: "303861", displayName: "Facundo Oton Menendez" },
  { username: "pintos", password: "329866", displayName: "Geraldine Pintos Ferme" },
  { username: "rasero", password: "328389", displayName: "Paula Rasero Cerrudo" },
  { username: "revetria", password: "287959", displayName: "Gerónimo Revetria Schuch" },
  { username: "rodriguez", password: "297464", displayName: "Clara Rodriguez Fernández" },
  { username: "sapone", password: "322519", displayName: "Valentino Sapone Tavares" },
  { username: "scaltritti", password: "326522", displayName: "Florencia Scaltritti Roura" },
  { username: "spotti", password: "330006", displayName: "Facundo Alejandro Spotti Rossi" },
  { username: "valino", password: "302559", displayName: "María José Valiño De Martini" },
];

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function findStudentUser(username: unknown, password: unknown): StudentUser | null {
  if (typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  const normalized = normalizeUsername(username);
  return STUDENTS.find((student) => student.username === normalized && student.password === password) ?? null;
}
