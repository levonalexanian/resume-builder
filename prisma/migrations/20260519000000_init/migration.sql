-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "name" VARCHAR NOT NULL,
    "phone" VARCHAR,
    "email" VARCHAR,
    "linkedin_url" VARCHAR,
    "linkedin_display" VARCHAR,
    "github_url" VARCHAR,
    "github_display" VARCHAR,
    "skills_latex" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_slug" VARCHAR NOT NULL,
    "file_slug" VARCHAR NOT NULL,
    "body_md" TEXT NOT NULL,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" VARCHAR NOT NULL,
    "file_slug" VARCHAR NOT NULL,
    "body_md" TEXT NOT NULL,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" VARCHAR NOT NULL,
    "file_slug" VARCHAR NOT NULL,
    "body_md" TEXT NOT NULL,
    "position" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_user_id_key" ON "users"("user_id");

-- CreateIndex
CREATE INDEX "ix_experiences_user_id" ON "experiences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_experiences_user_company_file" ON "experiences"("user_id", "company_slug", "file_slug");

-- CreateIndex
CREATE INDEX "ix_educations_user_id" ON "educations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_educations_user_slug_file" ON "educations"("user_id", "slug", "file_slug");

-- CreateIndex
CREATE INDEX "ix_projects_user_id" ON "projects"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_projects_user_slug_file" ON "projects"("user_id", "slug", "file_slug");

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

