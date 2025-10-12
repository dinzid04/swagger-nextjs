import Link from 'next/link';

export default function Home() {
  return (
    <div className="text-center">
      <section className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8">
        <h1 className="text-5xl font-extrabold mb-4 text-gray-900 dark:text-white">
          Welcome to Our Modern API
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Explore our features and dive into the documentation to get started.
        </p>
        <Link href="/docs" className="inline-block bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors duration-300">
            View API Docs
        </Link>
      </section>

      <section className="mt-12">
        <h2 className="text-3xl font-bold mb-6 text-gray-800 dark:text-white">Features</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Feature One</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Description of the first amazing feature. It's designed to be intuitive and powerful.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Feature Two</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Discover the benefits of the second feature, built for scalability and performance.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Feature Three</h3>
            <p className="text-gray-600 dark:text-gray-400">
              The third feature provides robust security and seamless integration options.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}