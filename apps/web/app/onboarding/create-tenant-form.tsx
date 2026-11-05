'use client';
import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { createTenantAction } from './actions';

function slugify(v: string) {
  return v
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function CreateTenantForm() {
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  return (
    <ActionForm action={createTenantAction}>
      {(pending) => (
        <>
          <Field label="Name des Unternehmens" htmlFor="name">
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              onChange={(e) => !touched && setSlug(slugify(e.target.value))}
            />
          </Field>
          <Field label="Adresse" htmlFor="slug" hint="Kleinbuchstaben, Ziffern und Bindestriche.">
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setTouched(true);
                setSlug(e.target.value);
              }}
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Wird angelegt …' : 'Unternehmen anlegen'}
          </Button>
        </>
      )}
    </ActionForm>
  );
}
