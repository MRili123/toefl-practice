import { notFound } from "next/navigation";
import { CoursePlayer } from "@/components/courses/CoursePlayer";
import { getCourse } from "@/engine/content/library";

export default async function CoursePage({ params }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const course = getCourse(id);
  if (!course) notFound();
  return <CoursePlayer course={course} />;
}
